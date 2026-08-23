import Anthropic from "@anthropic-ai/sdk";
import type { InspectionAgent } from "./agent";
import type { Instruction } from "../instructions";
import type { Finding, Severity } from "./findings";
import { createLogger, errorMessage, type Logger } from "../speckle/logging";

/**
 * Judges an indexed version one parameter at a time.
 *
 * The first version of this was a single agentic loop: the model called tools to
 * pick candidate parameters, then drilled in. It worked — seven real findings —
 * but cost ~$6 per run, because a 21-turn conversation re-sends its whole
 * history every turn and tool results are large, so input tokens grow
 * quadratically with turn count.
 *
 * The fix is to stop paying a model to do work SQL does for free. The scout
 * first decides its own scope from its brief — two small calls: which object
 * categories the brief concerns, then which parameters within them — and SQL
 * supplies the inventory and histograms. The model then only makes the
 * judgement it is actually needed for: "is this one histogram internally
 * inconsistent?" A room-naming scout never sees wall parameters at all.
 *
 * That turns one long conversation into many small stateless requests. There is
 * no history to re-read, the shared prefix is byte-identical across every
 * request so it caches, and the work parallelises.
 */

/**
 * Sonnet is well suited here: judging whether a short value list is internally
 * inconsistent is pattern-matching, not deep reasoning.
 */
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

/** Parameters judged concurrently — throughput without hammering rate limits. */
const CONCURRENCY = 6;

/**
 * Values shown in a single request. A parameter with more than this is split
 * across several, each judged independently.
 *
 * High-cardinality parameters cannot simply be skipped — `Type Name` holds 356
 * distinct values and three real findings — but sending 356 values in one
 * request makes it both expensive and easy for the model to lose the odd one
 * out among the noise. Splitting keeps every request small.
 */
const VALUES_PER_REQUEST = 120;

/**
 * Hard ceiling per run, estimated from usage as it accrues. When it trips the
 * run stops and reports what it has, rather than quietly spending on.
 */
const MAX_RUN_COST_USD = 1.5;

/**
 * Sonnet 5 list price per million tokens, for the running estimate only.
 * Billing is authoritative; this exists so a run can stop itself and so the
 * logs carry a number worth looking at.
 */
const PRICE_PER_MTOK = {
  input: 3,
  cacheWrite: 3.75,
  cacheRead: 0.3,
  output: 15
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
};

export type InspectionResult = {
  instructionId: string;
  findings: Finding[];
  /** Parameters the scout scoped itself to. */
  candidates: number;
  /** Parameters actually sent to the model. */
  judged: number;
  /** Judgements that threw. A run with failures is not a clean run. */
  failed: number;
  stoppedBecause: "completed" | "cost_cap" | "failed";
  /** First error seen, so a systemic failure is visible rather than inferred. */
  error: string | null;
  usage: Usage;
};

/**
 * Errors that will not fix themselves mid-run — bad request, bad key, no
 * credit. Retrying the remaining parameters just burns wall time and produces
 * an identical failure, so the run aborts on the first one.
 */
function isFatal(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIError &&
    typeof error.status === "number" &&
    [400, 401, 403, 404].includes(error.status)
  );
}

/** Runaway guard on parameters judged after scoping. */
const MAX_TARGETS = 60;

/**
 * Scoping: before anything is judged, the scout reads its own brief and
 * decides what data it needs — first which object categories the brief
 * concerns, then which parameters within them. This is what stops a
 * room-naming scout from filing findings about wall types: those parameters
 * are simply never shown to the judge.
 */
const SCOPE_SYSTEM = `You are Scout, a quality reviewer for building models published to Speckle.

Below is your inspection brief. Before any judging happens you must decide
WHAT data the brief actually concerns — the narrowest scope that covers it.
A brief about room naming must not inspect wall types; a brief about fire
ratings has no business in door hardware. Choose "all" only when the brief
genuinely applies to every kind of object.`;

const SCOPE_TOOL: Anthropic.Tool = {
  name: "select_categories",
  description: "Declare which object categories your brief concerns.",
  input_schema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["all", "selected"],
        description:
          "'selected' with a categories list when the brief targets specific kinds of objects; 'all' only when it genuinely applies to every category."
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description:
          "Category names copied verbatim from the list shown. Required when scope is 'selected'."
      }
    },
    required: ["scope"],
    additionalProperties: false
  }
};

const TARGET_TOOL: Anthropic.Tool = {
  name: "select_parameters",
  description: "Select the parameters your brief should inspect.",
  input_schema: {
    type: "object",
    properties: {
      keyPaths: {
        type: "array",
        items: { type: "string" },
        description:
          "keyPath strings copied verbatim from the list shown. Empty when none are relevant to the brief."
      }
    },
    required: ["keyPaths"],
    additionalProperties: false
  }
};

function toolInputOf(response: Anthropic.Message): Record<string, unknown> {
  const block = response.content.find(
    (item): item is Anthropic.ToolUseBlock => item.type === "tool_use"
  );
  return (block?.input as Record<string, unknown>) ?? {};
}

const SYSTEM_PREAMBLE = `You are Scout, a quality reviewer for building models published to Speckle.

You are shown ONE parameter from a model and the complete list of values it
takes, with a count of how many objects carry each value. Decide whether that
list contains a mistake.

You cannot see geometry, position or shape, and you are not shown individual
objects. Judge from the value list alone.

Call judge_parameter exactly once. Return verdict "ok" when the list is
legitimate variation, and "issue" only when you can point at specific values
that are wrong.`;

type Judgement = {
  verdict?: "ok" | "issue";
  severity?: Severity;
  summary?: string;
  suspectValues?: {
    value?: unknown;
    count?: unknown;
    correctedValue?: unknown;
  }[];
  suggestion?: string;
};

const JUDGE_TOOL: Anthropic.Tool = {
  name: "judge_parameter",
  description: "Record your verdict on this parameter's value list.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["ok", "issue"],
        description:
          "'ok' if the values are legitimate variation. 'issue' only if specific values are mistakes."
      },
      severity: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high: clear mistake with an unambiguous correct value present in the list. medium: real inconsistency, intended value less certain (e.g. mixed units). low: cosmetic (case or whitespace only)."
      },
      summary: {
        type: "string",
        description:
          "One sentence stating the problem. Required when verdict is 'issue'."
      },
      suspectValues: {
        type: "array",
        description:
          "Only the values that are wrong. Each needs the exact value as shown and what it should be replaced with.",
        items: {
          type: "object",
          properties: {
            value: {
              type: "string",
              description: "The wrong value, copied exactly as shown."
            },
            count: { type: "integer" },
            correctedValue: {
              type: "string",
              description:
                "The exact replacement value, ready to write into the model. Must be the literal corrected string (e.g. 'Insulation' not 'fix the spelling'). Omit only if you genuinely cannot determine it."
            }
          },
          required: ["value", "count"],
          additionalProperties: false
        }
      },
      suggestion: {
        type: "string",
        description: "What the suspect values should be, if clear."
      }
    },
    required: ["verdict"],
    additionalProperties: false
  }
};

/**
 * Rejects "corrections" that are not usable replacement values.
 *
 * A delta writes this string straight into the model, so a placeholder is worse
 * than no suggestion at all — it would propose replacing a real value with
 * literal text like `<UNKNOWN>`. Seen in practice when the model spots a wrong
 * value but has no basis for the right one.
 */
function isUsableCorrection(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Angle-bracketed and template-style placeholders.
  if (/^[<[{(].*[>\]})]$/.test(trimmed)) return false;
  return !/^(unknown|tbd|n\/?a|none|null|todo|\?+)$/i.test(trimmed);
}

function estimateCost(usage: Omit<Usage, "estimatedCostUsd">): number {
  return (
    (usage.inputTokens * PRICE_PER_MTOK.input +
      usage.cacheWriteTokens * PRICE_PER_MTOK.cacheWrite +
      usage.cacheReadTokens * PRICE_PER_MTOK.cacheRead +
      usage.outputTokens * PRICE_PER_MTOK.output) /
    1_000_000
  );
}

function renderHistogram(
  values: { value: string | null; count: number }[]
): string {
  return values
    .map((entry) => `${entry.count} x ${JSON.stringify(entry.value)}`)
    .join("\n");
}

export async function runInstruction(options: {
  apiKey: string;
  instruction: Instruction;
  agent: DurableObjectStub<InspectionAgent>;
  modelName: string | null;
  logger?: Logger;
  /** Cap on parameters judged, for cheap smoke runs. */
  maxCandidates?: number;
}): Promise<InspectionResult> {
  const { apiKey, instruction, agent } = options;
  const logger =
    options.logger ??
    createLogger(crypto.randomUUID(), { instruction: instruction.id });

  const client = new Anthropic({ apiKey });

  const findings: Finding[] = [];
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0
  };
  const takeUsage = (response: Anthropic.Message) => {
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
  };
  let judged = 0;
  let failed = 0;
  let firstError: string | null = null;
  // The cast keeps the union: this is assigned from inside the worker
  // closures, which TypeScript's narrowing cannot see — without it the
  // "cost_cap" comparison below is (wrongly) flagged as impossible.
  let stoppedBecause = "completed" as InspectionResult["stoppedBecause"];

  /** An honest early exit: the scout looked, and its brief scopes to nothing
   *  in this model — which is a clean outcome, not a failure. */
  const nothingInScope = (): InspectionResult => ({
    instructionId: instruction.id,
    findings: [],
    candidates: 0,
    judged: 0,
    failed: 0,
    stoppedBecause: "completed",
    error: null,
    usage: { ...usage, estimatedCostUsd: estimateCost(usage) }
  });

  // Shared by both scoping calls, so the second reads the first's cache.
  const scopeSystem: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${SCOPE_SYSTEM}\n\n---\n\n${instruction.body}`,
      cache_control: { type: "ephemeral" }
    }
  ];

  // ---- Scope stage 1: which categories does the brief concern? ----------
  const types = await agent.listObjectTypes();
  const categoryCounts = new Map<string, number>();
  for (const type of types) {
    if (!type.category) continue;
    categoryCounts.set(
      type.category,
      (categoryCounts.get(type.category) ?? 0) + type.count
    );
  }

  const scopeResponse = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: scopeSystem,
    tools: [SCOPE_TOOL],
    tool_choice: { type: "tool", name: "select_categories" },
    messages: [
      {
        role: "user",
        content: [
          `Model: ${options.modelName ?? "unknown"}`,
          "",
          "Object categories in this model (objects x category):",
          ...[...categoryCounts.entries()].map(
            ([category, count]) => `${count} x ${JSON.stringify(category)}`
          )
        ].join("\n")
      }
    ]
  });
  takeUsage(scopeResponse);

  const scopeInput = toolInputOf(scopeResponse) as {
    scope?: string;
    categories?: unknown[];
  };
  const scopedCategories =
    scopeInput.scope === "selected"
      ? [
          ...new Set(
            (scopeInput.categories ?? [])
              .filter((item): item is string => typeof item === "string")
              .filter((item) => categoryCounts.has(item))
          )
        ]
      : [];

  if (scopeInput.scope === "selected" && scopedCategories.length === 0) {
    logger.info("scope_no_categories", {
      requested: scopeInput.categories ?? []
    });
    return nothingInScope();
  }

  // ---- Scope stage 2: which parameters within that scope? ---------------
  // Category-scoped scouts pick from everything their categories carry —
  // including high-cardinality parameters like room names, which the global
  // enum-like heuristic deliberately excludes. Global scouts keep the
  // heuristic; it exists to keep "judge everything" affordable.
  type Target = {
    keyPath: string;
    category: string | null;
    objects: number;
    distinctValues: number;
    definition: string;
  };

  let inventory: Target[] = [];
  if (scopedCategories.length > 0) {
    for (const category of scopedCategories) {
      const keys = await agent.listPropertyKeys({
        category,
        minObjects: 2,
        limit: 120,
        textOnly: true
      });
      for (const key of keys) {
        if (key.distinctValues < 2 || key.distinctValues > 2000) continue;
        inventory.push({
          keyPath: key.keyPath,
          category,
          objects: key.objects,
          distinctValues: key.distinctValues,
          definition: key.name
        });
      }
    }
  } else {
    inventory = (await agent.listCandidateParameters()).map((candidate) => ({
      keyPath: candidate.keyPath,
      category: null,
      objects: candidate.objects,
      distinctValues: candidate.distinctValues,
      definition: candidate.internalDefinitionName
    }));
  }

  if (inventory.length === 0) {
    logger.info("scope_no_parameters", { categories: scopedCategories });
    return nothingInScope();
  }

  const targetResponse = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: scopeSystem,
    tools: [TARGET_TOOL],
    tool_choice: { type: "tool", name: "select_parameters" },
    messages: [
      {
        role: "user",
        content: [
          scopedCategories.length > 0
            ? `Parameters carried by the categories in scope (${scopedCategories.join(", ")}):`
            : "Candidate parameters across the whole model:",
          "",
          ...inventory.map(
            (target) =>
              `${target.keyPath}${target.category ? `  [${target.category}]` : ""}  — ${target.objects} objects, ${target.distinctValues} distinct values`
          ),
          "",
          "Select only the parameters your brief actually concerns, by exact keyPath."
        ].join("\n")
      }
    ]
  });
  takeUsage(targetResponse);

  const targetInput = toolInputOf(targetResponse) as { keyPaths?: unknown[] };
  const wanted = new Set(
    (targetInput.keyPaths ?? []).filter(
      (item): item is string => typeof item === "string"
    )
  );

  let targets = inventory.filter((target) => wanted.has(target.keyPath));
  if (options.maxCandidates) targets = targets.slice(0, options.maxCandidates);
  targets = targets.slice(0, MAX_TARGETS);

  logger.info("scope_selected", {
    categories: scopedCategories,
    offered: inventory.length,
    selected: targets.length,
    sample: targets.slice(0, 5).map((target) => target.keyPath)
  });

  if (targets.length === 0) {
    return nothingInScope();
  }

  // Byte-identical for every judge request, so it becomes the cached prefix
  // and is read at a fraction of its cost after the first call.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${SYSTEM_PREAMBLE}\n\n---\n\n${instruction.body}`,
      cache_control: { type: "ephemeral" }
    }
  ];

  type WorkItem = {
    target: Target;
    values: { value: string | null; count: number }[];
    part: number;
    parts: number;
  };

  const judgeOne = async (item: WorkItem) => {
    const { target, values } = item;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: [JUDGE_TOOL],
      tool_choice: { type: "tool", name: "judge_parameter" },
      messages: [
        {
          role: "user",
          content: [
            `Model: ${options.modelName ?? "unknown"}`,
            `Parameter: ${target.keyPath}`,
            `Definition: ${target.definition}`,
            target.category
              ? `Category: ${target.category} (only values carried by this category are shown)`
              : "",
            `Carried by ${target.objects} objects, ${target.distinctValues} distinct values.`,
            item.parts > 1
              ? `Showing part ${item.part} of ${item.parts} of the value list; judge only the values below.`
              : "",
            "",
            "Values (count x value):",
            renderHistogram(values)
          ].join("\n")
        }
      ]
    });

    takeUsage(response);
    judged++;

    if (response.stop_reason === "refusal") {
      logger.warn("judge_refused", { keyPath: target.keyPath });
      return;
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) return;

    const judgement = toolUse.input as Judgement;
    if (judgement.verdict !== "issue") return;

    const suspect = (judgement.suspectValues ?? []).filter(
      (item) => typeof item.value === "string"
    );

    // An "issue" citing no values is an unevidenced claim — drop it rather than
    // file it. A wrong finding costs the reviewer more than a missed one.
    if (suspect.length === 0 || !judgement.summary) {
      logger.warn("judge_issue_without_evidence", {
        keyPath: target.keyPath
      });
      return;
    }

    findings.push({
      instructionId: instruction.id,
      severity: judgement.severity ?? "medium",
      keyPath: target.keyPath,
      category: target.category,
      summary: judgement.summary,
      evidence: suspect.map((item) => ({
        value: String(item.value),
        count: Number(item.count ?? 0),
        // Drives the write-back delta. Only kept when it is an actual
        // replacement string and actually differs from the current value.
        correctedValue:
          typeof item.correctedValue === "string" &&
          item.correctedValue !== String(item.value) &&
          isUsableCorrection(item.correctedValue)
            ? item.correctedValue
            : null
      })),
      suggestion: judgement.suggestion ?? null
    });
  };

  // Histograms: bulk for a global scout; per-category for a scoped one, so
  // the judge only ever sees the values its own categories carry.
  const bulkHistograms =
    scopedCategories.length === 0
      ? await agent.histogramsFor(targets.map((target) => target.keyPath))
      : null;

  // Expand each target into one work item per chunk of its value list.
  const queue: WorkItem[] = [];
  for (const target of targets) {
    const values = bulkHistograms
      ? (bulkHistograms[target.keyPath] ?? [])
      : await agent.distinctValues({
          keyPath: target.keyPath,
          category: target.category,
          limit: 400
        });
    if (values.length < 2) continue;
    const parts = Math.ceil(values.length / VALUES_PER_REQUEST);
    for (let part = 0; part < parts; part++) {
      queue.push({
        target,
        values: values.slice(
          part * VALUES_PER_REQUEST,
          (part + 1) * VALUES_PER_REQUEST
        ),
        part: part + 1,
        parts
      });
    }
  }

  logger.info("work_planned", {
    targets: targets.length,
    requests: queue.length
  });

  // Fixed worker pool over a shared queue. Each task is independent, so this is
  // pure throughput. The cost cap is checked between tasks, so a run cannot
  // overshoot by more than the requests already in flight.
  const worker = async () => {
    for (;;) {
      if (estimateCost(usage) >= MAX_RUN_COST_USD) {
        stoppedBecause = "cost_cap";
        return;
      }
      const item = queue.shift();
      if (!item) return;
      try {
        await judgeOne(item);
      } catch (error) {
        failed++;
        firstError ??= errorMessage(error);
        logger.warn("judge_failed", {
          keyPath: item.target.keyPath,
          error: errorMessage(error)
        });
        // Don't grind through the remaining parameters on a systemic failure.
        if (isFatal(error)) {
          stoppedBecause = "failed";
          queue.length = 0;
          return;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
  );

  const estimatedCostUsd = estimateCost(usage);
  if (stoppedBecause === "cost_cap") {
    logger.warn("inspection_cost_cap", { estimatedCostUsd, judged });
  }

  // Nothing judged but failures recorded means the run did not happen at all.
  // Reporting that as "completed with no findings" would look like a clean
  // model, which is the most damaging way this can be wrong.
  if (judged === 0 && failed > 0) {
    stoppedBecause = "failed";
  }

  logger.info("inspection_complete", {
    instruction: instruction.id,
    categories: scopedCategories,
    targets: targets.length,
    judged,
    findings: findings.length,
    stoppedBecause,
    failed,
    error: firstError,
    ...usage,
    estimatedCostUsd
  });

  return {
    instructionId: instruction.id,
    findings,
    candidates: targets.length,
    judged,
    failed,
    stoppedBecause,
    error: firstError,
    usage: { ...usage, estimatedCostUsd }
  };
}

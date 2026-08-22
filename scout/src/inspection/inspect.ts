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
 * The fix is to stop paying a model to do work SQL does for free. Candidate
 * selection is now a deterministic query (`agent.listCandidateParameters`), and
 * the model only makes the judgement it is actually needed for: "is this one
 * histogram internally inconsistent?"
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
  /** Parameters the SQL filter selected. */
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
  suspectValues?: { value?: unknown; count?: unknown }[];
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
        description: "Only the values that are wrong, with their counts.",
        items: {
          type: "object",
          properties: {
            value: { type: "string" },
            count: { type: "integer" }
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

  // Free: no model involved in deciding what is worth looking at.
  const allCandidates = await agent.listCandidateParameters();
  const candidates = options.maxCandidates
    ? allCandidates.slice(0, options.maxCandidates)
    : allCandidates;
  const histograms = await agent.histogramsFor(
    candidates.map((candidate) => candidate.keyPath)
  );

  logger.info("candidates_selected", {
    candidates: allCandidates.length,
    judging: candidates.length,
    histogramKeys: Object.keys(histograms).length,
    sampleKey: candidates[0]?.keyPath,
    sampleValues: (histograms[candidates[0]?.keyPath ?? ""] ?? []).length
  });

  const findings: Finding[] = [];
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0
  };
  let judged = 0;
  let failed = 0;
  let firstError: string | null = null;
  let stoppedBecause: InspectionResult["stoppedBecause"] = "completed";

  // Byte-identical for every request, so it becomes the cached prefix and is
  // read at a fraction of its cost after the first call.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${SYSTEM_PREAMBLE}\n\n---\n\n${instruction.body}`,
      cache_control: { type: "ephemeral" }
    }
  ];

  type WorkItem = {
    candidate: (typeof candidates)[number];
    values: { value: string | null; count: number }[];
    part: number;
    parts: number;
  };

  const judgeOne = async (item: WorkItem) => {
    const { candidate, values } = item;

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
            `Parameter: ${candidate.keyPath}`,
            `Carried by ${candidate.objects} objects, ${candidate.distinctValues} distinct values.`,
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

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
    judged++;

    if (response.stop_reason === "refusal") {
      logger.warn("judge_refused", { keyPath: candidate.keyPath });
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
        keyPath: candidate.keyPath
      });
      return;
    }

    findings.push({
      instructionId: instruction.id,
      severity: judgement.severity ?? "medium",
      keyPath: candidate.keyPath,
      category: null,
      summary: judgement.summary,
      evidence: suspect.map((item) => ({
        value: String(item.value),
        count: Number(item.count ?? 0)
      })),
      suggestion: judgement.suggestion ?? null
    });
  };

  // Expand each candidate into one work item per chunk of its value list.
  const queue: WorkItem[] = [];
  for (const candidate of candidates) {
    const values = histograms[candidate.keyPath] ?? [];
    if (values.length < 2) continue;
    const parts = Math.ceil(values.length / VALUES_PER_REQUEST);
    for (let part = 0; part < parts; part++) {
      queue.push({
        candidate,
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
    candidates: candidates.length,
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
          keyPath: item.candidate.keyPath,
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
    candidates: candidates.length,
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
    candidates: candidates.length,
    judged,
    failed,
    stoppedBecause,
    error: firstError,
    usage: { ...usage, estimatedCostUsd }
  };
}

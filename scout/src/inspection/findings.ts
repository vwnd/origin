/**
 * Findings produced by an inspection run, and how they are identified across
 * runs.
 */

export type Severity = "high" | "medium" | "low";

export type Evidence = {
  value: string;
  count: number;
};

export type Finding = {
  instructionId: string;
  severity: Severity;
  /** Parameter the problem is in, e.g. `Parameters.…Identity Data.Fire Rating`. */
  keyPath: string;
  /** Object category the finding is scoped to, when it is. */
  category: string | null;
  /** One-sentence statement of the problem. */
  summary: string;
  /** The suspect values and how many objects carry each. */
  evidence: Evidence[];
  /** What the value probably should be, when that is clear. */
  suggestion: string | null;
};

/**
 * Stable identity for a finding, so the same problem is recognisable on a later
 * run of a later version.
 *
 * Deliberately excludes counts and prose: republishing a model with two more
 * mis-typed walls, or a reworded summary from the model, is the *same* problem
 * and must not produce a second issue. Only the instruction, the parameter, and
 * the set of offending values take part.
 */
export async function fingerprint(finding: Finding): Promise<string> {
  const values = finding.evidence
    .map((item) => item.value.trim().toLowerCase())
    .sort()
    .join("|");
  const material = [
    finding.instructionId,
    finding.keyPath,
    finding.category ?? "",
    values
  ].join("::");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material)
  );
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

/**
 * Marker line embedded in every Scout issue, carrying the fingerprints of the
 * findings it covers.
 *
 * `Issue.rawDescription` comes back as plain text, so the fingerprints can be
 * read straight out of an existing issue on a later run. This is what makes
 * dedupe work without Scout keeping its own state — the source of truth is the
 * Speckle project itself, so an issue someone deletes or resolves stops
 * suppressing its finding.
 */
const MARKER_PREFIX = "scout-fingerprints:";

export function renderFingerprintMarker(fingerprints: string[]): string {
  return `${MARKER_PREFIX} ${fingerprints.join(",")}`;
}

/** Pull every Scout fingerprint out of the text of existing issues. */
export function extractFingerprints(texts: (string | null)[]): Set<string> {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const line of text.split("\n")) {
      const index = line.indexOf(MARKER_PREFIX);
      if (index === -1) continue;
      for (const raw of line.slice(index + MARKER_PREFIX.length).split(",")) {
        const trimmed = raw.trim();
        if (trimmed) found.add(trimmed);
      }
    }
  }
  return found;
}

export type RenderedIssue = {
  title: string;
  description: string;
};

/**
 * One summary issue per run, listing every finding with its evidence.
 *
 * Counts are shown because they are the argument: "1 object says this, 500 say
 * that" is what makes a finding actionable without opening the model.
 */
export function renderSummaryIssue(options: {
  findings: Finding[];
  fingerprints: string[];
  versionId: string;
  modelName: string | null;
}): RenderedIssue {
  const { findings, versionId, modelName } = options;
  const count = findings.length;

  const lines: string[] = [
    `Scout reviewed ${modelName ? `"${modelName}"` : "this model"} at version ${versionId} and found ${count} ${count === 1 ? "issue" : "issues"}.`,
    ""
  ];

  findings.forEach((finding, index) => {
    lines.push(`${index + 1}. [${finding.severity}] ${finding.summary}`);
    lines.push(`   Parameter: ${finding.keyPath}`);
    const evidence = finding.evidence
      .map((item) => `${item.count} x "${item.value}"`)
      .join(", ");
    if (evidence) lines.push(`   Values: ${evidence}`);
    if (finding.suggestion) lines.push(`   Suggested: ${finding.suggestion}`);
    lines.push("");
  });

  lines.push(renderFingerprintMarker(options.fingerprints));

  return {
    title: `Scout: ${count} ${count === 1 ? "finding" : "findings"} on version ${versionId}`,
    description: lines.join("\n")
  };
}

/**
 * Collapse findings that describe the same underlying problem seen through
 * different parameters.
 *
 * Revit denormalizes the same string into several parameters — a wall type name
 * appears in `Type Name`, `Type`, `Family and Type`, `Host` and `Host Id`, each
 * with a different prefix. Judging parameters independently is what makes the
 * run cheap and parallel, but it means one misspelling is reported once per
 * carrier: "Insultation" came back twelve times in a single run.
 *
 * Two findings are treated as the same problem when their suspect values
 * overlap — either an exact match, or one value contained in the other, which
 * is what catches `"Exterior - ... w Insultation ..."` inside
 * `"Basic Wall: Exterior - ... w Insultation ..."`.
 *
 * The highest-severity member survives and records the other parameters it was
 * also seen in, so nothing is silently discarded.
 */

function normalisedValues(finding: Finding): string[] {
  return finding.evidence
    .map((item) => item.value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function describesSameProblem(a: Finding, b: Finding): boolean {
  const left = normalisedValues(a);
  const right = normalisedValues(b);
  if (left.length === 0 || right.length === 0) return false;

  for (const one of left) {
    for (const other of right) {
      if (one === other) return true;
      // Long enough to be meaningful — short values collide by chance.
      const shorter = one.length <= other.length ? one : other;
      const longer = one.length <= other.length ? other : one;
      if (shorter.length >= 12 && longer.includes(shorter)) return true;
    }
  }
  return false;
}

export function collapseDuplicates(findings: Finding[]): Finding[] {
  const kept: Finding[] = [];
  const alsoSeenIn: string[][] = [];

  for (const finding of sortFindings(findings)) {
    const index = kept.findIndex((existing) =>
      describesSameProblem(existing, finding)
    );

    if (index === -1) {
      kept.push(finding);
      alsoSeenIn.push([]);
      continue;
    }
    // sortFindings put the highest severity first, so the survivor is already
    // the most severe statement of the problem.
    if (finding.keyPath !== kept[index].keyPath) {
      alsoSeenIn[index].push(finding.keyPath);
    }
  }

  return kept.map((finding, index) => {
    const others = [...new Set(alsoSeenIn[index])];
    if (others.length === 0) return finding;
    return {
      ...finding,
      summary: `${finding.summary} (also present in ${others.length} related ${
        others.length === 1 ? "parameter" : "parameters"
      }: ${others.map((path) => path.split(".").pop()).join(", ")})`
    };
  });
}

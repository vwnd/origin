/**
 * Reads findings back out of an issue body.
 *
 * The issue text is the record — it is what a reviewer sees in Speckle, and it
 * survives independently of our own storage — so the Inbox parses it rather
 * than keeping a parallel copy. The format is the one `renderSummaryIssue`
 * writes:
 *
 *   1. [high] Summary sentence.
 *      Parameter: Parameters.Type Parameters.Identity Data.Fire Rating
 *      Values: 4 x "1 HR F*** THIS CLIENT", 66 x "0.5h"
 *      Suggested: 1 HR
 */

export type ParsedEvidence = { count: number; value: string };

export type ParsedFinding = {
  index: number;
  severity: "high" | "medium" | "low";
  summary: string;
  /** Full dotted path, as written in the issue. */
  keyPath: string | null;
  /** Trailing segment — the part a reader actually recognises. */
  parameter: string | null;
  evidence: ParsedEvidence[];
  suggestion: string | null;
};

const HEADING = /^(\d+)\.\s+\[(high|medium|low)\]\s+(.*)$/;
const EVIDENCE = /(\d+)\s*x\s*"([^"]*)"/g;

export function parseFindings(raw: string | null): ParsedFinding[] {
  if (!raw) return [];

  const findings: ParsedFinding[] = [];
  let current: ParsedFinding | null = null;

  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      if (current) findings.push(current);
      current = {
        index: Number(heading[1]),
        severity: heading[2] as ParsedFinding["severity"],
        summary: heading[3].trim(),
        keyPath: null,
        parameter: null,
        evidence: [],
        suggestion: null
      };
      continue;
    }

    if (!current) continue;
    const detail = line.trim();

    if (detail.startsWith("Parameter:")) {
      const keyPath = detail.slice("Parameter:".length).trim();
      current.keyPath = keyPath;
      current.parameter = keyPath.split(".").pop() ?? keyPath;
      continue;
    }

    if (detail.startsWith("Values:")) {
      const values = detail.slice("Values:".length);
      current.evidence = [...values.matchAll(EVIDENCE)].map((match) => ({
        count: Number(match[1]),
        value: match[2]
      }));
      continue;
    }

    if (detail.startsWith("Suggested:")) {
      current.suggestion = detail.slice("Suggested:".length).trim();
    }
  }

  if (current) findings.push(current);
  return findings;
}

import type { ObjectDelta } from "../speckle/client";
import type { InspectionAgent } from "./agent";
import type { Finding } from "./findings";
import { toDeltaPath } from "./editable";
import type { Logger } from "../speckle/logging";

/**
 * Expands findings into per-object parameter edits.
 *
 * A finding is a statement about values — "3 doors say `Metal - Painted -
 * Grey`, 80 say `Metal - Paint Finish - Grey`". A delta has to name each object
 * individually, so this resolves every wrong value back to the objects carrying
 * it and pairs the current value with the replacement.
 *
 * Only evidence carrying a `correctedValue` produces deltas. A finding worth
 * reporting but not automatically fixable still reaches the issue text — it
 * just contributes no proposed edit, which is the honest outcome.
 */

/**
 * Ceiling on edits attached to one issue. A parameter wrong on thousands of
 * objects is a modelling decision to review, not a bulk edit to rubber-stamp,
 * and an unbounded list would make the metadata unreviewable.
 */
const MAX_DELTAS_PER_ISSUE = 500;

export type DeltaBuildResult = {
  deltas: ObjectDelta[];
  /** Findings that produced at least one delta. */
  actionableFindings: number;
  /** Evidence entries the model could not supply a replacement for. */
  withoutCorrection: number;
  truncated: boolean;
};

export async function buildDeltas(options: {
  findings: Finding[];
  agent: DurableObjectStub<InspectionAgent>;
  logger: Logger;
}): Promise<DeltaBuildResult> {
  const { findings, agent, logger } = options;

  const deltas: ObjectDelta[] = [];
  // One object can only carry one value per parameter, so this also guards
  // against the same edit being proposed twice by overlapping findings.
  const seen = new Set<string>();
  let actionableFindings = 0;
  let withoutCorrection = 0;
  let truncated = false;

  for (const finding of findings) {
    let producedForFinding = 0;

    for (const evidence of finding.evidence) {
      if (!evidence.correctedValue) {
        withoutCorrection++;
        continue;
      }
      if (deltas.length >= MAX_DELTAS_PER_ISSUE) {
        truncated = true;
        break;
      }

      // A category-scoped finding edits only that category — other objects
      // sharing the same value were never judged and must not be touched.
      const objects = await agent.objectsWithValue({
        keyPath: finding.keyPath,
        value: evidence.value,
        category: finding.category,
        limit: MAX_DELTAS_PER_ISSUE - deltas.length
      });

      for (const object of objects) {
        if (!object.applicationId) continue;
        const key = `${object.objectId}::${finding.keyPath}`;
        if (seen.has(key)) continue;
        seen.add(key);

        deltas.push({
          id: object.objectId,
          applicationId: object.applicationId,
          path: toDeltaPath(finding.keyPath),
          from: evidence.value,
          to: evidence.correctedValue,
          internalDefinitionName: object.internalDefinitionName
        });
        producedForFinding++;
      }
    }

    if (producedForFinding > 0) actionableFindings++;
    if (truncated) break;
  }

  logger.info("deltas_built", {
    findings: findings.length,
    actionableFindings,
    deltas: deltas.length,
    withoutCorrection,
    truncated
  });

  return { deltas, actionableFindings, withoutCorrection, truncated };
}

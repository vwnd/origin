import { parameterConsistency } from "./parameter-consistency";
import type { Instruction } from "./types";

export type { Instruction } from "./types";

/**
 * The instruction set.
 *
 * One module per instruction, registered here. Deliberately a plain array
 * rather than a build-time glob: `import.meta.glob` is a Vite feature, and the
 * worker is bundled by Vite in production but by esbuild under `wrangler dev`,
 * so a glob would work in one and silently fail in the other.
 *
 * Adding an instruction: drop a file in this folder and add it to the array.
 */
export const INSTRUCTIONS: Instruction[] = [parameterConsistency];

export function loadEnabledInstructions(): Instruction[] {
  return INSTRUCTIONS.filter((instruction) => instruction.enabled);
}

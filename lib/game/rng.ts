/**
 * Pure deterministic Mulberry32 PRNG.
 * Allows exact battle replay reproducibility from a recorded seed and state.
 */
export interface RngStepResult {
  value: number; // [0, 1)
  nextState: number;
}

export function createInitialRngState(seed: number): number {
  return (seed >>> 0) || 0x9e3779b9;
}

export function nextRandom(state: number): RngStepResult {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export function nextRandomRange(
  state: number,
  min: number,
  max: number
): RngStepResult {
  const step = nextRandom(state);
  return {
    value: min + step.value * (max - min),
    nextState: step.nextState,
  };
}

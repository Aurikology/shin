/** Marks the bench's own required baselines (set by baselines.ts, read by harness.ts). A symbol, so no model can claim it by name. */
export const REQUIRED_BASELINE: unique symbol = Symbol('shin.bench.requiredBaseline');

/** The baselines every candidate must beat on the same items (B4). The Claude guess runs on a sample, so it is not here. */
export const REQUIRED_BASELINES = ['category_range', 'category_median'] as const;
export type RequiredBaseline = (typeof REQUIRED_BASELINES)[number];

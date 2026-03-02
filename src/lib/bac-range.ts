// ============================================================
// BAC Range Estimation — Widmark-based with variance buffer
// Never returns a single value; always a range.
// ============================================================

import { Drink } from "./types";
import { alcoholGrams } from "./bac";
import { BACRange } from "./impairment-types";

/**
 * Widmark distribution factors
 */
const WIDMARK_FACTOR: Record<string, number> = {
  male: 0.68,
  female: 0.55,
};

/** Default metabolism rate (BAC/hr) */
const DEFAULT_METABOLISM_RATE = 0.015;

/**
 * Absorption variance buffer.
 * Real-world alcohol absorption varies ±20–30% depending on food, hydration,
 * genetics, etc. We use this to produce a range.
 */
const ABSORPTION_VARIANCE_LOW = 0.75; // 25% less absorption (lower BAC)
const ABSORPTION_VARIANCE_HIGH = 1.25; // 25% more absorption (higher BAC)

/**
 * Compute Widmark BAC for a given absorption factor.
 */
function widmarkBAC(
  totalAlcoholGrams: number,
  weightLbs: number,
  gender: string,
  hoursSinceFirst: number,
  metabolismRate: number,
  absorptionFactor: number
): number {
  const bodyWeightGrams = (weightLbs / 2.205) * 1000;
  const r = WIDMARK_FACTOR[gender] ?? 0.68;
  const absorbed = totalAlcoholGrams * absorptionFactor;
  const bac = (absorbed / (bodyWeightGrams * r)) * 100 - metabolismRate * hoursSinceFirst;
  return Math.max(0, Math.round(bac * 10000) / 10000);
}

/**
 * Estimate BAC as a RANGE using the Widmark formula with absorption variance.
 *
 * Returns { estimatedBACLow, estimatedBACHigh, midpoint }
 *
 * Example output: { estimatedBACLow: 0.06, estimatedBACHigh: 0.10, midpoint: 0.08 }
 */
export function estimateBACRange(
  drinks: Drink[],
  weightLbs: number,
  gender: string,
  metabolismRate: number = DEFAULT_METABOLISM_RATE
): BACRange {
  if (drinks.length === 0 || weightLbs <= 0) {
    return { estimatedBACLow: 0, estimatedBACHigh: 0, midpoint: 0 };
  }

  const totalGrams = drinks.reduce((sum, d) => sum + alcoholGrams(d), 0);

  const sorted = [...drinks].sort(
    (a, b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
  );
  const firstDrinkTime = new Date(sorted[0].ordered_at).getTime();
  const hoursSinceFirst = (Date.now() - firstDrinkTime) / (1000 * 60 * 60);

  const low = widmarkBAC(totalGrams, weightLbs, gender, hoursSinceFirst, metabolismRate, ABSORPTION_VARIANCE_LOW);
  const high = widmarkBAC(totalGrams, weightLbs, gender, hoursSinceFirst, metabolismRate, ABSORPTION_VARIANCE_HIGH);
  const midpoint = Math.round(((low + high) / 2) * 10000) / 10000;

  return {
    estimatedBACLow: low,
    estimatedBACHigh: high,
    midpoint,
  };
}

/**
 * Format BAC range for display.
 * Example: "0.060 – 0.100"
 */
export function formatBACRange(range: BACRange): string {
  return `${range.estimatedBACLow.toFixed(3)} – ${range.estimatedBACHigh.toFixed(3)}`;
}

/**
 * Risk level based on BAC midpoint (performance-based, not legal).
 */
export function bacRangeRiskLevel(range: BACRange): "low" | "elevated" | "high" | "severe" {
  const mid = range.midpoint;
  if (mid >= 0.15) return "severe";
  if (mid >= 0.08) return "high";
  if (mid >= 0.05) return "elevated";
  return "low";
}

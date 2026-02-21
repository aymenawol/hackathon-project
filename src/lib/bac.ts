// ============================================================
// BAC (Blood Alcohol Content) calculation using Widmark formula
// Shared between /bartender and /customer
// ============================================================

import { Drink } from "./types";

/**
 * Widmark factor:
 *  male   = 0.68
 *  female = 0.55
 */
const WIDMARK_FACTOR: Record<string, number> = {
  male: 0.68,
  female: 0.55,
};

/** Metabolism rate: ~0.015 g/dL per hour */
const METABOLISM_RATE = 0.015;

/** Alcohol density: 0.789 g/mL */
const ALCOHOL_DENSITY = 0.789;

/**
 * Calculate pure alcohol grams from a single drink.
 * volume_ml * (abv / 100) * alcohol_density
 */
export function alcoholGrams(drink: Drink): number {
  return drink.volume_ml * (drink.abv / 100) * ALCOHOL_DENSITY;
}

/**
 * Estimate BAC using the Widmark formula.
 *
 * BAC = (totalAlcoholGrams / (bodyWeightGrams * widmarkFactor)) * 100
 *       - metabolismRate * hoursSinceFirstDrink
 *
 * Returns a value ≥ 0.
 */
export function estimateBAC(
  drinks: Drink[],
  weightKg: number,
  gender: "male" | "female"
): number {
  if (drinks.length === 0 || weightKg <= 0) return 0;

  const totalGrams = drinks.reduce((sum, d) => sum + alcoholGrams(d), 0);

  // Sort by ordered_at to find the first drink timestamp
  const sorted = [...drinks].sort(
    (a, b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
  );
  const firstDrinkTime = new Date(sorted[0].ordered_at).getTime();
  const now = Date.now();
  const hoursSinceFirst = (now - firstDrinkTime) / (1000 * 60 * 60);

  const bodyWeightGrams = weightKg * 1000;
  const r = WIDMARK_FACTOR[gender] ?? 0.68;

  const bac = (totalGrams / (bodyWeightGrams * r)) * 100 - METABOLISM_RATE * hoursSinceFirst;

  return Math.max(0, Math.round(bac * 1000) / 1000); // round to 3 decimal places
}

/**
 * Risk level based on BAC thresholds.
 */
export function bacRiskLevel(bac: number): "safe" | "caution" | "danger" {
  if (bac >= 0.08) return "danger";
  if (bac >= 0.05) return "caution";
  return "safe";
}

/**
 * Format BAC as a percentage string: "0.045%"
 */
export function formatBAC(bac: number): string {
  return `${bac.toFixed(3)}%`;
}

// ============================================================
// Predictive Modeling — Time-to-high-risk projection
// ============================================================

import { Drink } from "./types";
import { alcoholGrams } from "./bac";
import { BACRange } from "./impairment-types";

/**
 * Compute "drink velocity" — alcohol grams consumed per hour.
 */
function drinkVelocity(drinks: Drink[]): number {
  if (drinks.length < 2) return 0;
  const sorted = [...drinks].sort(
    (a, b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
  );
  const first = new Date(sorted[0].ordered_at).getTime();
  const last = new Date(sorted[sorted.length - 1].ordered_at).getTime();
  const hours = (last - first) / (1000 * 60 * 60);
  if (hours <= 0) return 0;

  const totalGrams = sorted.reduce((sum, d) => sum + alcoholGrams(d), 0);
  return totalGrams / hours;
}

/**
 * Predict minutes until BAC midpoint reaches the "High" risk threshold (0.08).
 *
 * Uses current BAC trend, drink velocity, and user's elimination rate.
 *
 * Returns:
 *  - positive number: projected minutes until high risk
 *  - 0: already at or above high risk
 *  - -1: BAC is trending down, unlikely to reach high risk
 */
export function predictTimeToHighRisk(
  currentBACRange: BACRange,
  drinks: Drink[],
  eliminationRate: number = 0.015
): number {
  const HIGH_RISK_THRESHOLD = 0.08;
  const currentMidpoint = currentBACRange.midpoint;

  // Already at or above high risk
  if (currentMidpoint >= HIGH_RISK_THRESHOLD) {
    return 0;
  }

  const velocity = drinkVelocity(drinks); // grams/hour

  // If no significant drinking velocity, BAC is decreasing
  if (velocity <= 0) {
    return -1;
  }

  // Simplified projection:
  // Net BAC increase rate ≈ (velocity_contribution - elimination_rate) per hour
  // velocity_contribution uses the average body composition from recent drinks
  const sorted = [...drinks].sort(
    (a, b) => new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
  );
  const totalHours = drinks.length > 1
    ? (Date.now() - new Date(sorted[0].ordered_at).getTime()) / (1000 * 60 * 60)
    : 1;
  
  // Imputed BAC rise rate from the total session
  const grossBACRate = totalHours > 0 ? (currentMidpoint + eliminationRate * totalHours) / totalHours : 0;
  const netBACRate = grossBACRate - eliminationRate;

  if (netBACRate <= 0) {
    return -1; // BAC trending down
  }

  const bacNeeded = HIGH_RISK_THRESHOLD - currentMidpoint;
  const hoursToHighRisk = bacNeeded / netBACRate;
  const minutes = Math.round(hoursToHighRisk * 60);

  return Math.max(0, minutes);
}

/**
 * Format the prediction for display.
 */
export function formatPrediction(minutes: number): string {
  if (minutes === 0) {
    return "Currently at high impairment risk";
  }
  if (minutes < 0) {
    return "Impairment risk is trending down";
  }
  if (minutes < 60) {
    return `Projected high impairment risk in ~${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `Projected high impairment risk in ~${hours}h ${mins}m`;
}

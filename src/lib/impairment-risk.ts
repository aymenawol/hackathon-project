// ============================================================
// Impairment Risk Calculation Engine
// Computes weighted fusion of BAC + impairment check scores
// ============================================================

import {
  ImpairmentResult,
  ImpairmentRiskLevel,
  ConfidenceLevel,
  RiskAssessment,
  BACRange,
} from "./impairment-types";

/**
 * Weights for each component in the final risk score.
 * BAC midpoint is always included; test weights scale dynamically.
 */
const WEIGHTS = {
  bac: 0.40,
  stability: 0.20,
  reaction: 0.20,
  focus: 0.20,
};

/**
 * Map BAC midpoint to a 0–100 impairment score.
 */
function bacToScore(midpoint: number): number {
  // 0.00 → 0, 0.08 → 60, 0.15 → 100
  if (midpoint <= 0) return 0;
  if (midpoint >= 0.15) return 100;
  return Math.round((midpoint / 0.15) * 100);
}

/**
 * Calculate confidence score based on number of tests taken.
 * 1 test  → 40–60% (low)
 * 2 tests → 60–80% (medium)
 * 3 tests → 80–95% (high)
 */
function computeConfidence(testCount: number): { score: number; level: ConfidenceLevel } {
  if (testCount >= 3) {
    return { score: 87, level: "high" };
  }
  if (testCount >= 2) {
    return { score: 70, level: "medium" };
  }
  return { score: 50, level: "low" };
}

/**
 * Map a numeric risk score (0–100) to a risk level.
 */
function scoreToRiskLevel(score: number): ImpairmentRiskLevel {
  if (score >= 75) return "Severe";
  if (score >= 50) return "High";
  if (score >= 30) return "Elevated";
  return "Low";
}

/**
 * Compute the final impairment risk assessment.
 *
 * Dynamically re-weights if not all 3 tests are taken:
 * - BAC always gets its base weight
 * - Available test weights are normalized to fill the remaining weight
 */
export function computeImpairmentRisk(
  bacRange: BACRange,
  checks: ImpairmentResult[]
): RiskAssessment {
  const bacScore = bacToScore(bacRange.midpoint);

  // Collect available test scores
  const testScores: Record<string, number> = {};
  for (const check of checks) {
    testScores[check.type] = check.impairmentContributionScore;
  }

  const testTypes = Object.keys(testScores);
  const testCount = testTypes.length;

  let finalScore: number;

  if (testCount === 0) {
    // No tests taken — BAC only
    finalScore = bacScore;
  } else {
    // Redistribute weights: BAC keeps its weight, remaining split among taken tests
    const totalTestWeight = 1 - WEIGHTS.bac;
    const perTestWeight = totalTestWeight / testCount;

    let weightedSum = WEIGHTS.bac * bacScore;
    for (const type of testTypes) {
      weightedSum += perTestWeight * testScores[type];
    }
    finalScore = Math.round(weightedSum);
  }

  const { score: confidenceScore, level: confidenceLevel } = computeConfidence(testCount);
  const impairmentRiskLevel = scoreToRiskLevel(finalScore);

  return {
    finalRiskScore: finalScore,
    impairmentRiskLevel,
    confidenceScore,
    confidenceLevel,
    bacRange,
    checks,
  };
}

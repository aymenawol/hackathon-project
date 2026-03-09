// ============================================================
// Personal Baseline Learning
// Uses exponential moving average to adapt baselines over time
// ============================================================

import { UserProfile, ImpairmentResult, SessionHistoryEntry, BACRange } from "./impairment-types";

/**
 * Smoothing factor for exponential moving average.
 * Lower = slower adaptation, higher = faster adaptation.
 * 0.2 means new data influences 20% of the new baseline.
 */
const EMA_ALPHA = 0.2;

/**
 * Apply exponential moving average:
 * newValue = alpha * observed + (1 - alpha) * current
 */
function ema(current: number, observed: number, alpha: number = EMA_ALPHA): number {
  return alpha * observed + (1 - alpha) * current;
}

/**
 * Update user profile baselines after a session.
 *
 * If the user reports they were NOT impaired, we treat the current
 * test results as a "sober baseline" reference and nudge baselines toward it.
 *
 * If the user reports they WERE impaired, we use that to calibrate
 * the elimination rate (they metabolized slower than expected).
 *
 * Returns a new UserProfile (does not mutate the input).
 */
export function updateBaselines(
  profile: UserProfile,
  checks: ImpairmentResult[],
  bacRange: BACRange,
  sessionDurationHours: number,
  userReportedImpaired: boolean
): UserProfile {
  const updated = { ...profile };

  for (const check of checks) {
    switch (check.type) {
      case "reaction": {
        const observedRT = check.rawMetrics.averageReactionTime;
        if (observedRT && !userReportedImpaired) {
          // User wasn't impaired → these metrics are closer to sober baseline
          updated.baselineReactionTime = ema(updated.baselineReactionTime, observedRT);
        }
        break;
      }
      case "stability": {
        const observedVariance = check.rawMetrics.swayVariance;
        if (observedVariance && !userReportedImpaired) {
          updated.baselineStabilityVariance = ema(updated.baselineStabilityVariance, observedVariance);
        }
        break;
      }
      case "focus": {
        // Support both old (smoothPursuitScore) and new (focusDeltaPercent) metric keys
        const observedFocus = check.rawMetrics.smoothPursuitScore ?? (100 - (check.baselineDelta ?? 0));
        if (observedFocus && !userReportedImpaired) {
          updated.baselineFocusScore = ema(updated.baselineFocusScore, observedFocus);
        }
        break;
      }
    }
  }

  // Adjust elimination rate based on impairment self-report
  if (userReportedImpaired && bacRange.midpoint > 0 && sessionDurationHours > 0) {
    // If user is still impaired, their elimination is slower than model predicted
    // Nudge elimination rate down slightly
    const adjustedRate = updated.avgEliminationRate * 0.95;
    updated.avgEliminationRate = Math.max(0.010, ema(updated.avgEliminationRate, adjustedRate, 0.15));
  } else if (!userReportedImpaired && bacRange.midpoint > 0.04) {
    // User not impaired but BAC was significant → they metabolize well
    // Nudge elimination rate up slightly
    const adjustedRate = updated.avgEliminationRate * 1.03;
    updated.avgEliminationRate = Math.min(0.025, ema(updated.avgEliminationRate, adjustedRate, 0.15));
  }

  return updated;
}

/**
 * Build a session history entry from session data.
 */
export function buildSessionHistoryEntry(
  sessionId: string,
  startTime: string,
  endTime: string,
  drinkCount: number,
  bacRange: BACRange,
  finalRiskScore: number,
  confidenceScore: number,
  userReportedImpaired?: boolean
): SessionHistoryEntry {
  return {
    sessionId,
    startTime,
    endTime,
    drinkCount,
    estimatedBACRange: bacRange,
    finalRiskScore,
    confidenceScore,
    userReportedImpaired,
  };
}

/**
 * Load user profile from localStorage (client-only).
 */
export function loadUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("sobr_user_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Save user profile to localStorage (client-only).
 */
export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("sobr_user_profile", JSON.stringify(profile));
  } catch {
    // silent fail
  }
}

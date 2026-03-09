// ============================================================
// Focus Score — normalise raw eye metrics against baseline,
// produce focusDeltaPercent and impairmentContributionScore.
// ============================================================

import { RawEyeMetrics } from "./eyeMetrics";

/** Baseline statistics for each metric (mean + std). */
export interface FocusBaseline {
  trackingErrorMean: number;
  trackingErrorStd: number;
  jitterMean: number;
  jitterStd: number;
  correctionMean: number;
  correctionStd: number;
  headDriftMean: number;
  headDriftStd: number;
}

/** Sane defaults for a first-time user (derived from typical sober tracking). */
export const DEFAULT_FOCUS_BASELINE: FocusBaseline = {
  trackingErrorMean: 0.06,
  trackingErrorStd: 0.02,
  jitterMean: 0.002,
  jitterStd: 0.001,
  correctionMean: 2.0,
  correctionStd: 0.8,
  headDriftMean: 0.001,
  headDriftStd: 0.0005,
};

/**
 * Compute z-score clamped to [0, 4].
 * Positive z means worse than baseline.
 */
function zScore(current: number, mean: number, std: number): number {
  if (std <= 0) return 0;
  const z = (current - mean) / std;
  return Math.max(0, Math.min(z, 4));
}

/**
 * Map a 0–4 z-score to 0–100 via sigmoid-like scaling.
 */
function normalise(z: number): number {
  return Math.min(100, (z / 4) * 100);
}

export interface FocusScoreResult {
  focusDeltaPercent: number;
  impairmentContributionScore: number;
  normalizedTrackingError: number;
  normalizedJitter: number;
  normalizedCorrections: number;
  normalizedHeadDrift: number;
}

/**
 * Compute the weighted focus-delta and impairment contribution.
 *
 * Weights (from spec):
 *   trackingError  0.40
 *   jitter         0.25
 *   corrections    0.20
 *   headDrift      0.15
 */
export function computeFocusScore(
  metrics: RawEyeMetrics,
  baseline: FocusBaseline
): FocusScoreResult {
  const zTracking = zScore(metrics.trackingError, baseline.trackingErrorMean, baseline.trackingErrorStd);
  const zJitter = zScore(metrics.jitterVariance, baseline.jitterMean, baseline.jitterStd);
  const zCorrections = zScore(metrics.correctionRate, baseline.correctionMean, baseline.correctionStd);
  const zHeadDrift = zScore(metrics.headDrift, baseline.headDriftMean, baseline.headDriftStd);

  const nTracking = normalise(zTracking);
  const nJitter = normalise(zJitter);
  const nCorrections = normalise(zCorrections);
  const nHeadDrift = normalise(zHeadDrift);

  const focusDeltaPercent = Math.round(
    0.40 * nTracking +
    0.25 * nJitter +
    0.20 * nCorrections +
    0.15 * nHeadDrift
  );

  const clamped = Math.max(0, Math.min(100, focusDeltaPercent));

  return {
    focusDeltaPercent: clamped,
    impairmentContributionScore: clamped / 100,
    normalizedTrackingError: Math.round(nTracking),
    normalizedJitter: Math.round(nJitter),
    normalizedCorrections: Math.round(nCorrections),
    normalizedHeadDrift: Math.round(nHeadDrift),
  };
}

/**
 * Update a baseline using exponential moving average.
 * Call this after a sober calibration run.
 */
export function updateFocusBaseline(
  current: FocusBaseline,
  metrics: RawEyeMetrics,
  alpha: number = 0.2
): FocusBaseline {
  function ema(cur: number, obs: number) {
    return alpha * obs + (1 - alpha) * cur;
  }
  // For std, we approximate by EMA'ing the absolute deviation
  function emaStd(curStd: number, curMean: number, obs: number) {
    const dev = Math.abs(obs - curMean);
    return Math.max(0.0001, ema(curStd, dev));
  }

  return {
    trackingErrorMean: ema(current.trackingErrorMean, metrics.trackingError),
    trackingErrorStd: emaStd(current.trackingErrorStd, current.trackingErrorMean, metrics.trackingError),
    jitterMean: ema(current.jitterMean, metrics.jitterVariance),
    jitterStd: emaStd(current.jitterStd, current.jitterMean, metrics.jitterVariance),
    correctionMean: ema(current.correctionMean, metrics.correctionRate),
    correctionStd: emaStd(current.correctionStd, current.correctionMean, metrics.correctionRate),
    headDriftMean: ema(current.headDriftMean, metrics.headDrift),
    headDriftStd: emaStd(current.headDriftStd, current.headDriftMean, metrics.headDrift),
  };
}

/**
 * Load focus baseline from localStorage.
 */
export function loadFocusBaseline(): FocusBaseline {
  if (typeof window === "undefined") return DEFAULT_FOCUS_BASELINE;
  try {
    const raw = localStorage.getItem("sobr_focus_baseline");
    return raw ? JSON.parse(raw) : DEFAULT_FOCUS_BASELINE;
  } catch {
    return DEFAULT_FOCUS_BASELINE;
  }
}

/**
 * Save focus baseline to localStorage.
 */
export function saveFocusBaseline(baseline: FocusBaseline): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("sobr_focus_baseline", JSON.stringify(baseline));
  } catch {
    // silent
  }
}

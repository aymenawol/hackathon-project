// ============================================================
// Eye Metrics — feature extraction from raw focus tracking frames
// ============================================================

export interface FocusFrame {
  timestamp: number;
  eyeX: number;
  eyeY: number;
  dotX: number;
  dotY: number;
  headYaw: number;
  headPitch: number;
}

export interface RawEyeMetrics {
  trackingError: number;
  jitterVariance: number;
  correctionRate: number;
  headDrift: number;
}

/**
 * Compute tracking error — mean absolute distance between eye position and dot.
 */
function computeTrackingError(frames: FocusFrame[]): number {
  if (frames.length === 0) return 0;
  const errors = frames.map((f) => Math.abs(f.eyeX - f.dotX));
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

/**
 * Compute eye velocity for each consecutive frame, then return the
 * variance of those velocities — high variance = jittery tracking.
 */
function computeJitterVariance(frames: FocusFrame[]): number {
  if (frames.length < 3) return 0;

  const velocities: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].timestamp - frames[i - 1].timestamp;
    if (dt <= 0) continue;
    const dx = frames[i].eyeX - frames[i - 1].eyeX;
    const dy = frames[i].eyeY - frames[i - 1].eyeY;
    velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
  }

  if (velocities.length === 0) return 0;

  const mean = velocities.reduce((s, v) => s + v, 0) / velocities.length;
  const variance =
    velocities.reduce((s, v) => s + (v - mean) ** 2, 0) / velocities.length;
  return variance;
}

/**
 * Count direction reversals in eye X velocity → corrections per second.
 */
function computeCorrectionRate(frames: FocusFrame[]): number {
  if (frames.length < 3) return 0;

  let corrections = 0;
  let prevSign = 0;

  for (let i = 1; i < frames.length; i++) {
    const dx = frames[i].eyeX - frames[i - 1].eyeX;
    const sign = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) {
      corrections++;
    }
    if (sign !== 0) prevSign = sign;
  }

  const duration =
    frames[frames.length - 1].timestamp - frames[0].timestamp;
  if (duration <= 0) return 0;
  return corrections / duration;
}

/**
 * Head drift — variance of combined headYaw + headPitch over the test.
 * Penalises compensatory head movement instead of eye movement.
 */
function computeHeadDrift(frames: FocusFrame[]): number {
  if (frames.length < 2) return 0;

  const combined = frames.map((f) => f.headYaw + f.headPitch);
  const mean = combined.reduce((s, v) => s + v, 0) / combined.length;
  const variance =
    combined.reduce((s, v) => s + (v - mean) ** 2, 0) / combined.length;
  return variance;
}

/**
 * Extract all raw metrics from an array of focus frames.
 */
export function extractEyeMetrics(frames: FocusFrame[]): RawEyeMetrics {
  return {
    trackingError: computeTrackingError(frames),
    jitterVariance: computeJitterVariance(frames),
    correctionRate: computeCorrectionRate(frames),
    headDrift: computeHeadDrift(frames),
  };
}

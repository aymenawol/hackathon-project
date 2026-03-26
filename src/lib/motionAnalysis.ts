// ============================================================
// Motion / Gait Analysis — ported from Python motion_app.py
//
// Analyses accelerometer + gyroscope data collected via the
// DeviceMotion API to detect intoxication-related gait patterns.
// ============================================================

export interface MotionSample {
  ax: number; // accelerometer x  (m/s²)
  ay: number; // accelerometer y
  az: number; // accelerometer z
  gx: number; // gyroscope x       (rad/s)
  gy: number; // gyroscope y
  gz: number; // gyroscope z
  t: number;  // timestamp in seconds (performance.now()/1000)
}

export interface MotionMetrics {
  accMean: number;
  accStd: number;
  accCv: number;       // coefficient of variation
  gyroMean: number;
  gyroStd: number;
  jerkMean: number;
  jerkStd: number;
  lateralStd: number;  // x-axis sway
  sampleCount: number;
}

export interface MotionAnalysisResult {
  status: 'collecting' | 'ok' | 'flat' | 'error';
  label?: 'Sober' | 'Drunk';
  score?: number;         // 0–1 probability
  impairmentScore?: number; // 0–100 for ImpairmentResult
  metrics?: MotionMetrics;
  message?: string;
}

// ── thresholds (from Python script, tuned for phone-in-pocket walking) ──
const ACCEL_STD_DRUNK   = 4.0;   // m/s²
const GYRO_STD_DRUNK    = 1.2;   // rad/s
const JERK_MEAN_DRUNK   = 18.0;  // m/s³
const IRREGULARITY_DRUNK = 0.45; // coefficient of variation
const LATERAL_STD_DRUNK  = 3.5;  // m/s²

// ── edge-case: phone lying on table / not being carried ─────────────────
// If total acceleration std is < 0.3 and gyro std < 0.05 the device
// is essentially motionless — reject the sample as invalid.
const FLAT_ACCEL_STD  = 0.3;
const FLAT_GYRO_STD   = 0.05;
// Near-zero movement overall (user might be standing still holding phone)
const MINIMAL_MOTION_ACCEL_STD = 0.8;

function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Minimum samples required before we analyse (≈2 s at 50 Hz).
 */
export const MIN_SAMPLES = 40;

/**
 * Analyse collected motion samples and return impairment metrics + score.
 *
 * Handles edge cases:
 *  - phone on table (flat / near-zero motion)
 *  - phone stationary in hand (minimal motion)
 *  - too few samples
 */
export function analyzeMotion(samples: MotionSample[]): MotionAnalysisResult {
  if (samples.length < MIN_SAMPLES) {
    return { status: 'collecting', message: `Collecting data… (${samples.length}/${MIN_SAMPLES})` };
  }

  // ── acceleration magnitudes ──────────────────────────────────────
  const mags = samples.map(s => magnitude(s.ax, s.ay, s.az));
  const accMean = mean(mags);
  const accStd  = stdev(mags);
  const accCv   = accMean !== 0 ? accStd / accMean : 0;

  // ── gyroscope magnitudes ─────────────────────────────────────────
  const gMags    = samples.map(s => magnitude(s.gx, s.gy, s.gz));
  const gyroMean = mean(gMags);
  const gyroStd  = stdev(gMags);

  // ── edge-case: flat / no motion (phone on table) ─────────────────
  if (accStd < FLAT_ACCEL_STD && gyroStd < FLAT_GYRO_STD) {
    return {
      status: 'flat',
      message:
        'Very little movement detected — it looks like the phone is resting on a surface. Please hold the phone to your chest or pocket and stand on one leg.',
      metrics: buildMetrics(accMean, accStd, accCv, gyroMean, gyroStd, 0, 0, 0, samples.length),
    };
  }

  // ── edge-case: minimal motion (standing still, holding phone) ────
  if (accStd < MINIMAL_MOTION_ACCEL_STD && gyroStd < 0.15) {
    return {
      status: 'flat',
      message:
        'Not enough movement detected. Please hold the phone to your chest or pocket and balance on one leg for the duration of the test.',
      metrics: buildMetrics(accMean, accStd, accCv, gyroMean, gyroStd, 0, 0, 0, samples.length),
    };
  }

  // ── jerk (derivative of accel magnitude) ─────────────────────────
  const jerks: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 0) continue;
    const dm = Math.abs(magnitude(samples[i].ax, samples[i].ay, samples[i].az) -
                        magnitude(samples[i - 1].ax, samples[i - 1].ay, samples[i - 1].az));
    jerks.push(dm / dt);
  }
  const jerkMean = mean(jerks);
  const jerkStd  = stdev(jerks);

  // ── lateral sway (x-axis std) ────────────────────────────────────
  const xVals      = samples.map(s => s.ax);
  const lateralStd = stdev(xVals);

  // ── scoring (same weights as Python) ─────────────────────────────
  let score = 0;
  if (accStd  > ACCEL_STD_DRUNK)     score += 0.30;
  if (gyroStd > GYRO_STD_DRUNK)      score += 0.25;
  if (jerkMean > JERK_MEAN_DRUNK)    score += 0.20;
  if (accCv   > IRREGULARITY_DRUNK)  score += 0.15;
  if (lateralStd > LATERAL_STD_DRUNK) score += 0.10;

  score = Math.min(score, 1.0);

  const label: 'Sober' | 'Drunk' = score >= 0.45 ? 'Drunk' : 'Sober';

  // Map the 0-1 probability to a 0-100 impairment score for ImpairmentResult
  const impairmentScore = Math.round(score * 100);

  return {
    status: 'ok',
    label,
    score: Math.round(score * 1000) / 1000,
    impairmentScore,
    metrics: buildMetrics(accMean, accStd, accCv, gyroMean, gyroStd, jerkMean, jerkStd, lateralStd, samples.length),
  };
}

function buildMetrics(
  accMean: number, accStd: number, accCv: number,
  gyroMean: number, gyroStd: number,
  jerkMean: number, jerkStd: number,
  lateralStd: number, sampleCount: number,
): MotionMetrics {
  return {
    accMean:    Math.round(accMean * 1000) / 1000,
    accStd:     Math.round(accStd * 1000) / 1000,
    accCv:      Math.round(accCv * 1000) / 1000,
    gyroMean:   Math.round(gyroMean * 1000) / 1000,
    gyroStd:    Math.round(gyroStd * 1000) / 1000,
    jerkMean:   Math.round(jerkMean * 1000) / 1000,
    jerkStd:    Math.round(jerkStd * 1000) / 1000,
    lateralStd: Math.round(lateralStd * 1000) / 1000,
    sampleCount,
  };
}

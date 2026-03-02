'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ImpairmentResult } from '@/lib/impairment-types';
import { loadUserProfile } from '@/lib/baseline-learning';
import { DEFAULT_USER_PROFILE } from '@/lib/impairment-types';
import { Eye, Camera, X, CheckCircle2 } from 'lucide-react';

interface FocusCheckProps {
  onResult: (result: ImpairmentResult) => void;
  onCancel: () => void;
}

// ============================================================
// Eye Tracking Focus Check
//
// Uses the front camera to track:
// - Smooth pursuit stability (following a moving target)
// - Tracking jitter variance (steadiness of gaze)
// - Drift deviation (involuntary head/eye drift)
//
// The moving dot target traces a smooth path on screen while
// we analyze the user's face/eye position via video frames.
// ============================================================

/** Duration of the focus check in seconds */
const TEST_DURATION = 10;

/** Phases of the test */
type TestPhase = 'instructions' | 'calibrating' | 'tracking' | 'analyzing' | 'complete';

/** Raw tracking data collected each frame */
interface TrackingFrame {
  timestamp: number;
  /** Target dot position (normalized 0-1) */
  targetX: number;
  targetY: number;
  /** Estimated gaze/face center (from brightness centroid analysis) */
  gazeX: number;
  gazeY: number;
  /** Face detection confidence (0-1) */
  faceConfidence: number;
}

/**
 * Lightweight face/eye position estimation using canvas pixel analysis.
 * Computes the brightness-weighted centroid of the face region,
 * which shifts as the user's eyes/head track the target.
 *
 * Returns normalized (0-1) x, y position and confidence.
 */
function estimateGazeFromFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): { x: number; y: number; confidence: number } {
  const w = canvas.width;
  const h = canvas.height;

  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Focus on the upper portion (face region) - typically top 60%
  const faceRegionHeight = Math.floor(h * 0.6);
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let brightPixels = 0;

  // We look for skin-tone-ish pixels and bright eye reflection areas
  for (let y = 0; y < faceRegionHeight; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Brightness
      const brightness = (r + g + b) / 3;

      // Simple skin/face detection heuristic:
      // R > 60, R > G, R > B, |R-G| < 80
      const isSkinTone = r > 60 && r > g && r > b && Math.abs(r - g) < 80;

      if (isSkinTone && brightness > 40) {
        // Weight bright facial areas more (eyes, nose bridge reflect light)
        const weight = brightness / 255;
        weightedX += x * weight;
        weightedY += y * weight;
        totalWeight += weight;
        brightPixels++;
      }
    }
  }

  if (totalWeight === 0 || brightPixels < 50) {
    return { x: 0.5, y: 0.5, confidence: 0 };
  }

  const cx = weightedX / totalWeight / w;
  const cy = weightedY / totalWeight / faceRegionHeight;

  // Confidence based on how many face pixels we found
  const faceCoverage = brightPixels / (w * faceRegionHeight);
  const confidence = Math.min(1, faceCoverage * 10);

  return { x: cx, y: cy, confidence };
}

/**
 * Generate a smooth pursuit target path.
 * The dot moves in a figure-8 / lemniscate pattern.
 */
function getTargetPosition(t: number, duration: number): { x: number; y: number } {
  const progress = t / duration;
  const angle = progress * Math.PI * 4; // Two full cycles

  // Figure-8 pattern (lemniscate of Bernoulli variant)
  const x = 0.5 + 0.3 * Math.sin(angle);
  const y = 0.5 + 0.2 * Math.sin(angle * 2);

  return { x, y };
}

/**
 * Analyze collected tracking data to compute impairment metrics.
 */
function analyzeTrackingData(
  frames: TrackingFrame[],
  baselineFocusScore: number
): {
  smoothPursuitScore: number;
  jitterVariance: number;
  driftDeviation: number;
  focusDeltaPercent: number;
  impairmentContributionScore: number;
} {
  if (frames.length < 10) {
    return {
      smoothPursuitScore: baselineFocusScore,
      jitterVariance: 0,
      driftDeviation: 0,
      focusDeltaPercent: 0,
      impairmentContributionScore: 0,
    };
  }

  // Filter to frames with decent face confidence
  const validFrames = frames.filter((f) => f.faceConfidence > 0.2);
  if (validFrames.length < 5) {
    return {
      smoothPursuitScore: baselineFocusScore * 0.7,
      jitterVariance: 0.1,
      driftDeviation: 0.1,
      focusDeltaPercent: 30,
      impairmentContributionScore: 40,
    };
  }

  // 1. Smooth Pursuit Stability: correlation between target movement and gaze movement
  const gazeDeltas: number[] = [];
  const targetDeltas: number[] = [];
  for (let i = 1; i < validFrames.length; i++) {
    const dx = validFrames[i].gazeX - validFrames[i - 1].gazeX;
    const dy = validFrames[i].gazeY - validFrames[i - 1].gazeY;
    const tdx = validFrames[i].targetX - validFrames[i - 1].targetX;
    const tdy = validFrames[i].targetY - validFrames[i - 1].targetY;
    gazeDeltas.push(Math.sqrt(dx * dx + dy * dy));
    targetDeltas.push(Math.sqrt(tdx * tdx + tdy * tdy));
  }

  // Correlation-like measure: how well gaze tracks target movement
  const meanGaze = gazeDeltas.reduce((a, b) => a + b, 0) / gazeDeltas.length;
  const meanTarget = targetDeltas.reduce((a, b) => a + b, 0) / targetDeltas.length;

  let covariance = 0;
  let gazeVar = 0;
  let targetVar = 0;
  for (let i = 0; i < gazeDeltas.length; i++) {
    const gd = gazeDeltas[i] - meanGaze;
    const td = targetDeltas[i] - meanTarget;
    covariance += gd * td;
    gazeVar += gd * gd;
    targetVar += td * td;
  }

  const correlation = (gazeVar > 0 && targetVar > 0)
    ? covariance / (Math.sqrt(gazeVar) * Math.sqrt(targetVar))
    : 0;

  // Smooth pursuit score: 0-100 based on correlation
  const smoothPursuitScore = Math.max(0, Math.min(100, Math.round((correlation + 1) * 50)));

  // 2. Tracking Jitter Variance: high-frequency noise in gaze positions
  const gazeXDiffs: number[] = [];
  const gazeYDiffs: number[] = [];
  for (let i = 2; i < validFrames.length; i++) {
    // Second derivative (acceleration) captures jitter
    const ddx = validFrames[i].gazeX - 2 * validFrames[i - 1].gazeX + validFrames[i - 2].gazeX;
    const ddy = validFrames[i].gazeY - 2 * validFrames[i - 1].gazeY + validFrames[i - 2].gazeY;
    gazeXDiffs.push(ddx);
    gazeYDiffs.push(ddy);
  }

  const jitterX = gazeXDiffs.reduce((a, b) => a + b * b, 0) / Math.max(gazeXDiffs.length, 1);
  const jitterY = gazeYDiffs.reduce((a, b) => a + b * b, 0) / Math.max(gazeYDiffs.length, 1);
  const jitterVariance = Math.sqrt(jitterX + jitterY);

  // 3. Drift Deviation: average distance between gaze and target
  const distances = validFrames.map((f) => {
    const dx = f.gazeX - f.targetX;
    const dy = f.gazeY - f.targetY;
    return Math.sqrt(dx * dx + dy * dy);
  });
  const driftDeviation = distances.reduce((a, b) => a + b, 0) / distances.length;

  // Compute impairment contribution score (0-100)
  // Higher score = more impaired
  const jitterScore = Math.min(100, jitterVariance * 5000); // Scale jitter to 0-100
  const driftScore = Math.min(100, driftDeviation * 300); // Scale drift to 0-100
  const pursuitImpairment = 100 - smoothPursuitScore;

  const impairmentContributionScore = Math.round(
    pursuitImpairment * 0.4 + jitterScore * 0.3 + driftScore * 0.3
  );

  // Focus delta compared to baseline
  const focusDeltaPercent = baselineFocusScore > 0
    ? Math.round(((baselineFocusScore - smoothPursuitScore) / baselineFocusScore) * 100)
    : 0;

  return {
    smoothPursuitScore,
    jitterVariance: Math.round(jitterVariance * 10000) / 10000,
    driftDeviation: Math.round(driftDeviation * 10000) / 10000,
    focusDeltaPercent: Math.max(0, focusDeltaPercent),
    impairmentContributionScore: Math.max(0, Math.min(100, impairmentContributionScore)),
  };
}

export function FocusCheck({ onResult, onCancel }: FocusCheckProps) {
  const [phase, setPhase] = useState<TestPhase>('instructions');
  const [progress, setProgress] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ReturnType<typeof analyzeTrackingData> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<TrackingFrame[]>([]);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Get baseline from profile
  const profile = loadUserProfile() || DEFAULT_USER_PROFILE;
  const baselineFocusScore = profile.baselineFocusScore;

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  // Tracking loop (declared before startCamera so it can be referenced)
  const startTracking = useCallback(() => {
    framesRef.current = [];
    startTimeRef.current = performance.now();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const video = videoRef.current!;

    function trackFrame() {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;

      if (elapsed >= TEST_DURATION) {
        // Test complete
        setPhase('analyzing');
        const results = analyzeTrackingData(framesRef.current, baselineFocusScore);
        setMetrics(results);

        setTimeout(() => {
          setPhase('complete');
        }, 1000);
        return;
      }

      setProgress((elapsed / TEST_DURATION) * 100);

      const target = getTargetPosition(elapsed, TEST_DURATION);
      const gaze = estimateGazeFromFrame(video, canvas, ctx);

      framesRef.current.push({
        timestamp: elapsed,
        targetX: target.x,
        targetY: target.y,
        gazeX: gaze.x,
        gazeY: gaze.y,
        faceConfidence: gaze.confidence,
      });

      rafRef.current = requestAnimationFrame(trackFrame);
    }

    rafRef.current = requestAnimationFrame(trackFrame);
  }, [baselineFocusScore]);

  // Start camera (declared after startTracking so it can reference it)
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase('calibrating');

      // Brief calibration pause (2s) to let user center their face
      setTimeout(() => {
        setPhase('tracking');
        startTracking();
      }, 2000);
    } catch (err) {
      setCameraError('Unable to access camera. Please allow camera permissions and try again.');
      console.error('Camera error:', err);
    }
  }, [startTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Submit result
  function handleComplete() {
    stopCamera();

    const m = metrics!;
    const result: ImpairmentResult = {
      type: 'focus',
      rawMetrics: {
        smoothPursuitScore: m.smoothPursuitScore,
        jitterVariance: m.jitterVariance,
        driftDeviation: m.driftDeviation,
        focusDeltaPercent: m.focusDeltaPercent,
      },
      baselineDelta: m.focusDeltaPercent,
      impairmentContributionScore: m.impairmentContributionScore,
      completedAt: new Date().toISOString(),
    };
    onResult(result);
  }

  // Target dot position (for rendering)
  const elapsed = phase === 'tracking' ? (progress / 100) * TEST_DURATION : 0;
  const target = getTargetPosition(elapsed, TEST_DURATION);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Eye className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold">Focus Check</h2>
              <p className="text-xs text-muted-foreground">Camera-based eye tracking</p>
            </div>
          </div>
          <button onClick={() => { stopCamera(); onCancel(); }} className="p-1 rounded-full hover:bg-muted">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Instructions Phase */}
        {phase === 'instructions' && (
          <div className="px-6 py-8 space-y-6 text-center">
            <div className="flex size-20 mx-auto items-center justify-center rounded-full bg-primary/10">
              <Camera className="size-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Follow the Moving Dot</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A dot will move across the screen for {TEST_DURATION} seconds.
                Follow it with your eyes while keeping your head relatively still.
                Hold your phone at arm&apos;s length with the front camera facing you.
              </p>
            </div>
            {cameraError && (
              <p className="text-sm text-destructive">{cameraError}</p>
            )}
            <Button onClick={startCamera} className="w-full h-12 rounded-xl" size="lg">
              <Camera className="mr-2 size-5" />
              Start Focus Check
            </Button>
          </div>
        )}

        {/* Calibrating Phase */}
        {phase === 'calibrating' && (
          <div className="px-6 py-8 space-y-4 text-center">
            <div className="relative mx-auto w-64 h-48 rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                playsInline
                muted
              />
              {/* Face guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-32 rounded-full border-2 border-dashed border-white/50" />
              </div>
            </div>
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />
            <p className="text-sm font-medium animate-pulse">Calibrating... Center your face</p>
          </div>
        )}

        {/* Tracking Phase */}
        {phase === 'tracking' && (
          <div className="px-6 py-4 space-y-4">
            {/* Camera preview (small) */}
            <div className="relative mx-auto w-48 h-36 rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                playsInline
                muted
              />
            </div>
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />

            {/* Target tracking area */}
            <div className="relative w-full h-40 rounded-xl bg-muted/50 border overflow-hidden">
              {/* Moving target dot */}
              <div
                className="absolute size-6 rounded-full bg-primary shadow-lg shadow-primary/30 transition-all duration-75"
                style={{
                  left: `${target.x * 100}%`,
                  top: `${target.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
              </div>
              <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-muted-foreground">
                Follow the dot with your eyes
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        )}

        {/* Analyzing Phase */}
        {phase === 'analyzing' && (
          <div className="px-6 py-12 text-center space-y-4">
            <div className="mx-auto size-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-sm font-medium">Analyzing eye tracking data...</p>
          </div>
        )}

        {/* Complete Phase */}
        {phase === 'complete' && metrics && (
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-emerald-500">
              <CheckCircle2 className="size-6" />
              <span className="font-bold">Focus Check Complete</span>
            </div>

            <div className="space-y-3">
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Smooth Pursuit Score</span>
                  <span className="font-bold">{metrics.smoothPursuitScore}/100</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tracking Jitter</span>
                  <span className="font-bold">{metrics.jitterVariance.toFixed(4)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Drift Deviation</span>
                  <span className="font-bold">{metrics.driftDeviation.toFixed(4)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Baseline Delta</span>
                  <span className="font-bold">{metrics.focusDeltaPercent}%</span>
                </CardContent>
              </Card>
              <Card className={metrics.impairmentContributionScore >= 50 ? 'border-rose-500/30' : 'border-emerald-500/30'}>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Impairment Score</span>
                  <span className={`text-lg font-bold ${
                    metrics.impairmentContributionScore >= 70 ? 'text-rose-500' :
                    metrics.impairmentContributionScore >= 40 ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {metrics.impairmentContributionScore}/100
                  </span>
                </CardContent>
              </Card>
            </div>

            <Button onClick={handleComplete} className="w-full h-12 rounded-xl" size="lg">
              <CheckCircle2 className="mr-2 size-5" />
              Submit Results
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

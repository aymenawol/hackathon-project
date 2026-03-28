'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ImpairmentResult } from '@/lib/impairment-types';
import { Eye, Camera, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useFaceMesh, FaceLandmarkData } from '@/hooks/useFaceMesh';
import { useFocusTest, getDotX, DOT_Y } from '@/hooks/useFocusTest';
import { DotTrackerCanvas } from './dot-tracker-canvas';

// ============================================================
// Eye Tracking Focus Check  (MediaPipe FaceMesh)
//
// Features:
//  - Blue eye outlines overlaid on camera feed
//  - Distance guidance ("move closer" / "move further")
//  - AI-powered impairment determination (GPT)
// ============================================================

// Ideal inter-eye distance as fraction of frame width
// (~0.20–0.30 means face fills roughly 1/3 of frame)
const IDEAL_EYE_DIST_MIN = 0.18;
const IDEAL_EYE_DIST_MAX = 0.35;

interface FocusCheckProps {
  onResult: (result: ImpairmentResult) => void;
  onCancel: () => void;
  /** Current BAC estimate (passed so we can give AI context). */
  bacEstimate?: number;
}

interface AIVerdict {
  verdict: 'sober' | 'slightly_impaired' | 'impaired';
  confidence: number;
  explanation: string;
}

export function FocusCheck({ onResult, onCancel, bacEstimate = 0 }: FocusCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest face data for drawing overlays + distance guidance
  const latestFaceRef = useRef<FaceLandmarkData | null>(null);
  const [distanceHint, setDistanceHint] = useState<'ok' | 'closer' | 'further'>('ok');
  const [aiVerdict, setAiVerdict] = useState<AIVerdict | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const {
    phase,
    progress,
    result,
    errorMsg,
    startCamera,
    startCalibration,
    recordFrame,
    cleanup,
    TEST_DURATION,
  } = useFocusTest();

  // Combined face data handler — records frame AND stores latest landmarks for overlay
  const handleFaceData = useCallback((data: FaceLandmarkData) => {
    latestFaceRef.current = data;
    recordFrame(data);

    // Distance guidance based on inter-eye distance
    if (data.eyeDistance < IDEAL_EYE_DIST_MIN) {
      setDistanceHint('closer');
    } else if (data.eyeDistance > IDEAL_EYE_DIST_MAX) {
      setDistanceHint('further');
    } else {
      setDistanceHint('ok');
    }
  }, [recordFrame]);

  // Wire FaceMesh → handleFaceData
  const { ready: meshReady, error: meshError, startProcessing, stopProcessing } = useFaceMesh({
    videoRef,
    onResults: handleFaceData,
    enabled: phase === 'camera' || phase === 'calibrating' || phase === 'tracking',
  });

  // Once camera opens, kick off calibration once mesh is ready
  useEffect(() => {
    if (meshReady && (phase === 'camera')) {
      startCalibration();
    }
  }, [meshReady, phase, startCalibration]);

  // Start sending frames to FaceMesh while calibrating/tracking
  useEffect(() => {
    if (meshReady && (phase === 'calibrating' || phase === 'tracking')) {
      const stop = startProcessing();
      return () => { stop?.(); stopProcessing(); };
    }
  }, [meshReady, phase, startProcessing, stopProcessing]);

  // ---- Draw blue eye outlines on canvas overlay ----
  useEffect(() => {
    const showCamera = phase === 'camera' || phase === 'calibrating' || phase === 'tracking';
    if (!showCamera) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;

    function draw() {
      const c = canvasRef.current;
      const v = videoRef.current;
      if (!c || !v) return;

      // Match canvas size to video display size
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== rect.width * dpr || c.height !== rect.height * dpr) {
        c.width = rect.width * dpr;
        c.height = rect.height * dpr;
        ctx!.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;
      ctx!.clearRect(0, 0, w, h);

      const face = latestFaceRef.current;
      if (face && face.irisRadius > 0) {
        drawIrisCircle(ctx!, face.leftIrisCenter, face.irisRadius, w, h);
        drawIrisCircle(ctx!, face.rightIrisCenter, face.irisRadius, w, h);
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Clean up on unmount
  useEffect(() => () => { cleanup(); }, [cleanup]);

  // ---- When test completes, ask AI for verdict ----
  useEffect(() => {
    if (phase !== 'complete' || !result || aiVerdict || aiLoading) return;

    setAiLoading(true);
    fetch('/api/eye-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMetrics: result.rawMetrics,
        score: result.score.focusDeltaPercent,
        bacEstimate,
      }),
    })
      .then((r) => r.json())
      .then((data: AIVerdict) => setAiVerdict(data))
      .catch(() => setAiVerdict({
        verdict: result.score.focusDeltaPercent >= 45 ? 'impaired' : result.score.focusDeltaPercent >= 25 ? 'slightly_impaired' : 'sober',
        confidence: 0.5,
        explanation: 'AI analysis unavailable. Using metric-based assessment.',
      }))
      .finally(() => setAiLoading(false));
  }, [phase, result, bacEstimate, aiVerdict, aiLoading]);

  // ---- Handlers ----
  const handleStart = useCallback(async () => {
    if (!videoRef.current) return;
    await startCamera(videoRef.current);
  }, [startCamera]);

  const handleCancel = useCallback(() => {
    cleanup();
    onCancel();
  }, [cleanup, onCancel]);

  function handleSubmit() {
    if (!result) return;
    cleanup();

    // Use AI verdict to adjust the impairment score
    let adjustedScore = result.score.focusDeltaPercent;
    if (aiVerdict) {
      if (aiVerdict.verdict === 'sober') adjustedScore = Math.min(adjustedScore, 15);
      else if (aiVerdict.verdict === 'slightly_impaired') adjustedScore = Math.max(20, Math.min(adjustedScore, 45));
      // 'impaired' leaves the score as-is or higher
    }

    const impairmentResult: ImpairmentResult = {
      type: 'focus',
      rawMetrics: {
        pursuitGain: result.rawMetrics.pursuitGain,
        saccadeRate: result.rawMetrics.saccadeRate,
        positionError: result.rawMetrics.positionError,
        gazeStability: result.rawMetrics.gazeStability,
      },
      baselineDelta: adjustedScore,
      impairmentContributionScore: adjustedScore,
      completedAt: new Date().toISOString(),
    };
    onResult(impairmentResult);
  }

  // Current dot position for the canvas
  const elapsed = phase === 'tracking' ? (progress / 100) * TEST_DURATION : 0;
  const dotX = getDotX(elapsed);

  const combinedError = errorMsg || meshError;
  const showCamera = phase === 'camera' || phase === 'calibrating' || phase === 'tracking';

  const verdictColor = aiVerdict?.verdict === 'sober' ? 'text-emerald-500' :
    aiVerdict?.verdict === 'slightly_impaired' ? 'text-amber-500' : 'text-destructive';
  const verdictLabel = aiVerdict?.verdict === 'sober' ? 'No Impairment Detected' :
    aiVerdict?.verdict === 'slightly_impaired' ? 'Mild Signs Detected' : 'Possible Impairment';

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Eye className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Focus Check</h2>
              <p className="text-xs text-muted-foreground">AI-powered eye tracking</p>
            </div>
          </div>
          <button onClick={handleCancel} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Camera preview with blue eye outline overlay */}
        <div className={showCamera ? "relative w-full" : "hidden"}>
          <video
            ref={videoRef}
            className="w-full h-52 object-cover bg-black"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
          />
          {/* Distance guidance overlay */}
          {distanceHint !== 'ok' && (
            <div className="absolute top-3 left-0 right-0 flex justify-center">
              <span className="bg-black/70 text-white text-xs font-medium px-4 py-2 rounded-full backdrop-blur-sm">
                {distanceHint === 'closer'
                  ? '📱 Move closer to the screen'
                  : '📱 Move further from the screen'}
              </span>
            </div>
          )}
          {distanceHint === 'ok' && showCamera && phase !== 'camera' && (
            <div className="absolute top-3 left-0 right-0 flex justify-center">
              <span className="bg-emerald-600/80 text-white text-xs font-medium px-4 py-2 rounded-full backdrop-blur-sm">
                ✓ Good distance
              </span>
            </div>
          )}
        </div>

        {/* --- Instructions Phase --- */}
        {phase === 'idle' && (
          <div className="px-5 py-8 space-y-6 text-center overflow-y-auto">
            <div className="flex size-20 mx-auto items-center justify-center rounded-2xl bg-primary/10">
              <Camera className="size-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Follow the Moving Dot</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                A dot will move across the screen for {TEST_DURATION} seconds.
                Follow it with your eyes while keeping your head still.
              </p>
            </div>

            {/* Numbered steps */}
            <div className="space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</div>
                <span className="text-sm text-muted-foreground">Allow camera access when prompted</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</div>
                <span className="text-sm text-muted-foreground">Position your face so blue circles appear over your eyes</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</div>
                <span className="text-sm text-muted-foreground">Follow the dot with just your eyes</span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground text-center">
              Video is processed locally. AI analyses metrics only.
            </div>

            {combinedError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{combinedError}</span>
              </div>
            )}

            <Button onClick={handleStart} className="w-full h-12 rounded-xl" size="lg">
              <Camera className="mr-2 size-5" />
              Start Focus Check
            </Button>
          </div>
        )}

        {/* --- Camera / Calibrating Phase --- */}
        {(phase === 'camera' || phase === 'calibrating') && (
          <div className="px-5 py-6 space-y-4 text-center overflow-y-auto">
            <div className="flex size-16 mx-auto items-center justify-center rounded-full border-4 border-muted">
              <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </div>
            <p className="text-sm font-medium animate-pulse">
              {phase === 'camera' ? 'Starting camera...' : 'Look straight ahead — calibrating...'}
            </p>
            <p className="text-xs text-muted-foreground">
              Move close enough that blue circles appear over your eyes.
            </p>
          </div>
        )}

        {/* --- Tracking Phase --- */}
        {phase === 'tracking' && (
          <div className="px-4 py-4 space-y-4 overflow-y-auto">
            {/* Dot tracking area */}
            <div className="relative w-full h-28 rounded-xl bg-muted/50 border overflow-hidden">
              <DotTrackerCanvas dotX={dotX} active />
              <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-muted-foreground">
                Follow the dot with your eyes
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        )}

        {/* --- Analyzing Phase --- */}
        {phase === 'analyzing' && (
          <div className="px-5 py-12 text-center space-y-4">
            <div className="mx-auto size-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-sm font-medium">Analysing eye tracking data...</p>
          </div>
        )}

        {/* --- Error Phase --- */}
        {phase === 'error' && (
          <div className="px-5 py-8 text-center space-y-4 overflow-y-auto">
            <div className="flex size-16 mx-auto items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
            <p className="text-sm text-destructive">{combinedError}</p>
            <Button variant="outline" onClick={handleCancel} className="w-full h-12 rounded-xl">
              Close
            </Button>
          </div>
        )}

        {/* --- Complete Phase --- */}
        {phase === 'complete' && result && (
          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            {/* AI Verdict */}
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm font-medium">AI is analysing your results...</span>
              </div>
            ) : aiVerdict ? (
              <Card className={
                aiVerdict.verdict === 'sober' ? 'border-emerald-500/30 bg-emerald-500/5' :
                aiVerdict.verdict === 'slightly_impaired' ? 'border-amber-500/30 bg-amber-500/5' :
                'border-destructive/30 bg-destructive/5'
              }>
                <CardContent className="p-4 text-center space-y-1.5">
                  <p className={`text-xl font-bold ${verdictColor}`}>{verdictLabel}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{aiVerdict.explanation}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center gap-2 text-emerald-500">
                <CheckCircle2 className="size-6" />
                <span className="font-bold text-base">Focus Check Complete</span>
              </div>
            )}

            {/* Raw metrics (collapsed) */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                View raw metrics
              </summary>
              <div className="mt-2 space-y-1.5">
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pursuit Gain</span>
                    <span className="font-bold text-sm">{result.rawMetrics.pursuitGain.toFixed(2)}</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Saccade Rate</span>
                    <span className="font-bold text-sm">{result.rawMetrics.saccadeRate.toFixed(1)}/s</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Position Error</span>
                    <span className="font-bold text-sm">{result.rawMetrics.positionError.toFixed(3)}</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Gaze Stability</span>
                    <span className="font-bold text-sm">{result.rawMetrics.gazeStability.toFixed(3)}</span>
                  </CardContent>
                </Card>
              </div>
            </details>

            <Button
              onClick={handleSubmit}
              className="w-full h-12 rounded-xl"
              size="lg"
              disabled={aiLoading}
            >
              <CheckCircle2 className="mr-2 size-5" />
              Submit Results
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Draw a blue circle that follows the iris centre. */
function drawIrisCircle(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  irisRadius: number,
  width: number,
  height: number,
) {
  // Scale radius relative to frame, with a minimum so it's always visible
  const r = Math.max(irisRadius * width * 1.6, 8);
  const cx = center.x * width;
  const cy = center.y * height;

  ctx.save();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)'; // blue-500
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(59, 130, 246, 0.6)';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

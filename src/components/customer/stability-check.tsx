'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ImpairmentResult } from '@/lib/impairment-types';
import {
  MotionSample,
  MotionAnalysisResult,
  analyzeMotion,
} from '@/lib/motionAnalysis';
import { Activity, X, CheckCircle2, AlertTriangle, Loader2, Smartphone } from 'lucide-react';

// ============================================================
// Stability Check — Motion / Gyroscope gait analysis
//
// User taps Start → 5-second countdown → 15s recording of
// DeviceMotion events → analysis → AI verdict → submit.
// ============================================================

const RECORDING_SECONDS = 15;
const COUNTDOWN_SECONDS = 5;

type Phase = 'idle' | 'countdown' | 'recording' | 'analysing' | 'complete' | 'error';

interface StabilityCheckProps {
  onResult: (result: ImpairmentResult) => void;
  onCancel: () => void;
}

interface AIVerdict {
  verdict: 'sober' | 'slightly_impaired' | 'impaired';
  confidence: number;
  explanation: string;
}

export function StabilityCheck({ onResult, onCancel }: StabilityCheckProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<MotionAnalysisResult | null>(null);
  const [aiVerdict, setAiVerdict] = useState<AIVerdict | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const samplesRef = useRef<MotionSample[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('devicemotion', handleMotionEvent as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DeviceMotion handler ──────────────────────────────────────────
  const handleMotionEvent = useCallback((e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity;
    const rot = e.rotationRate;
    if (!acc) return;

    samplesRef.current.push({
      ax: acc.x ?? 0,
      ay: acc.y ?? 0,
      az: acc.z ?? 0,
      gx: rot?.alpha ? (rot.alpha * Math.PI) / 180 : 0, // convert deg/s → rad/s
      gy: rot?.beta  ? (rot.beta  * Math.PI) / 180 : 0,
      gz: rot?.gamma ? (rot.gamma * Math.PI) / 180 : 0,
      t: performance.now() / 1000,
    });
  }, []);

  // ── Request permission (iOS 13+) ─────────────────────────────────
  const requestPermission = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DME = DeviceMotionEvent as any;
    if (typeof DME.requestPermission === 'function') {
      try {
        const perm = await DME.requestPermission();
        if (perm !== 'granted') {
          setPermissionDenied(true);
          return false;
        }
      } catch {
        setPermissionDenied(true);
        return false;
      }
    }
    return true;
  }, []);

  // ── Start recording ──────────────────────────────────────────────
  const startRecording = useCallback(() => {
    samplesRef.current = [];
    startTimeRef.current = performance.now();
    window.addEventListener('devicemotion', handleMotionEvent as EventListener);

    setElapsed(0);
    setPhase('recording');

    timerRef.current = setInterval(() => {
      const secs = Math.floor((performance.now() - startTimeRef.current) / 1000);
      setElapsed(secs);

      if (secs >= RECORDING_SECONDS) {
        if (timerRef.current) clearInterval(timerRef.current);
        window.removeEventListener('devicemotion', handleMotionEvent as EventListener);
        finishRecording();
      }
    }, 250);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMotionEvent]);

  // ── After countdown, start recording ──────────────────────────────
  const handleStart = useCallback(async () => {
    const ok = await requestPermission();
    if (!ok) return;

    setPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);

    let count = COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        startRecording();
      }
    }, 1000);
  }, [requestPermission, startRecording]);

  // ── Finish & analyse ──────────────────────────────────────────────
  const finishRecording = useCallback(() => {
    setPhase('analysing');
    const samples = [...samplesRef.current];

    const result = analyzeMotion(samples);
    setAnalysis(result);

    if (result.status === 'flat') {
      // Edge case: not enough motion
      setPhase('error');
      setErrorMessage(result.message ?? 'Not enough motion detected.');
      return;
    }

    if (result.status === 'collecting') {
      setPhase('error');
      setErrorMessage('Not enough sensor data was collected. Make sure motion sensors are available.');
      return;
    }

    // Ask AI for verdict
    setPhase('complete');
    setAiLoading(true);

    fetch('/api/motion-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics: result.metrics,
        score: result.score,
        label: result.label,
      }),
    })
      .then(r => r.json())
      .then((data: AIVerdict) => setAiVerdict(data))
      .catch(() => {
        // Fallback to rule-based
        const s = result.score ?? 0;
        setAiVerdict({
          verdict: s >= 0.45 ? 'impaired' : s >= 0.25 ? 'slightly_impaired' : 'sober',
          confidence: 0.5,
          explanation: s >= 0.45
            ? 'Your gait data suggests possible impairment — excessive sway and irregular steps detected.'
            : s >= 0.25
            ? 'Some irregularity in your movement, but results are not conclusive.'
            : 'Your walking pattern looks steady. No signs of impairment detected.',
        });
      })
      .finally(() => setAiLoading(false));
  }, []);

  // ── Submit result to parent ──────────────────────────────────────
  function handleSubmit() {
    if (!analysis || analysis.status !== 'ok') return;

    let score = analysis.impairmentScore ?? 0;

    // Adjust by AI verdict
    if (aiVerdict) {
      if (aiVerdict.verdict === 'sober') score = Math.min(score, 15);
      else if (aiVerdict.verdict === 'slightly_impaired') score = Math.max(20, Math.min(score, 45));
    }

    onResult({
      type: 'stability',
      rawMetrics: {
        accMean: analysis.metrics!.accMean,
        accStd: analysis.metrics!.accStd,
        accCv: analysis.metrics!.accCv,
        gyroMean: analysis.metrics!.gyroMean,
        gyroStd: analysis.metrics!.gyroStd,
        jerkMean: analysis.metrics!.jerkMean,
        jerkStd: analysis.metrics!.jerkStd,
        lateralStd: analysis.metrics!.lateralStd,
      },
      baselineDelta: score,
      impairmentContributionScore: score,
      completedAt: new Date().toISOString(),
    });
  }

  const progress = (elapsed / RECORDING_SECONDS) * 100;

  const verdictColor =
    aiVerdict?.verdict === 'sober'
      ? 'text-emerald-500'
      : aiVerdict?.verdict === 'slightly_impaired'
      ? 'text-amber-500'
      : 'text-destructive';
  const verdictLabel =
    aiVerdict?.verdict === 'sober'
      ? 'No Impairment Detected'
      : aiVerdict?.verdict === 'slightly_impaired'
      ? 'Mild Signs Detected'
      : 'Possible Impairment';

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border bg-background shadow-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Activity className="size-5 text-blue-500" />
            </div>
            <div>
              <h2 className="font-bold text-base">Stability Check</h2>
              <p className="text-xs text-muted-foreground">Balance analysis via motion sensors</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* ── Instructions ─────────────────────────────────────────── */}
        {phase === 'idle' && (
          <div className="px-5 py-8 space-y-6 text-center overflow-y-auto">
            <div className="flex size-20 mx-auto items-center justify-center rounded-2xl bg-blue-500/10">
              <Smartphone className="size-10 text-blue-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold">One-Leg Balance Test</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Hold the phone to your chest with both hands,
                then <strong>stand on one leg</strong> for <strong>{RECORDING_SECONDS} seconds</strong>.
              </p>
            </div>

            {/* Numbered steps */}
            <div className="space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">1</div>
                <span className="text-sm text-muted-foreground">Hold the phone to your chest</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">2</div>
                <span className="text-sm text-muted-foreground">Stand on one leg when countdown ends</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">3</div>
                <span className="text-sm text-muted-foreground">Hold balance for {RECORDING_SECONDS} seconds</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-xl px-4 py-2.5">
              <AlertTriangle className="size-4 shrink-0" />
              <span>Don&apos;t put the phone on a table — hold it to your chest!</span>
            </div>

            {permissionDenied && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">
                Motion sensor permission was denied. Please enable it in your device settings and try again.
              </div>
            )}

            <Button onClick={handleStart} className="w-full h-12 rounded-xl" size="lg">
              <Activity className="mr-2 size-5" />
              Start Stability Check
            </Button>
          </div>
        )}

        {/* ── Countdown ────────────────────────────────────────────── */}
        {phase === 'countdown' && (
          <div className="px-5 py-14 text-center space-y-4">
            <div className="flex size-32 mx-auto items-center justify-center rounded-full border-4 border-primary/20">
              <span className="text-6xl font-bold text-primary animate-pulse">{countdown}</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Get ready — stand on one leg!</p>
            <p className="text-xs text-muted-foreground">Hold the phone to your chest with both hands.</p>
          </div>
        )}

        {/* ── Recording ────────────────────────────────────────────── */}
        {phase === 'recording' && (
          <div className="px-5 py-8 space-y-6 text-center">
            {/* SVG circular progress */}
            <div className="relative flex size-40 mx-auto items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
                <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="6" className="text-blue-500 transition-all duration-300"
                  strokeDasharray={`${2 * Math.PI * 72}`}
                  strokeDashoffset={`${2 * Math.PI * 72 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center">
                <Activity className="size-8 text-blue-500 mx-auto mb-1 animate-pulse" />
                <span className="text-2xl font-bold tabular-nums">{RECORDING_SECONDS - elapsed}s</span>
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold">Recording…</h3>
              <p className="text-sm text-muted-foreground">
                Hold your balance
              </p>
            </div>
          </div>
        )}

        {/* ── Analysing ────────────────────────────────────────────── */}
        {phase === 'analysing' && (
          <div className="px-5 py-14 text-center space-y-4">
            <Loader2 className="size-12 mx-auto text-primary animate-spin" />
            <p className="text-sm font-medium">Analysing your gait data…</p>
          </div>
        )}

        {/* ── Error (flat / insufficient motion) ────────────────────── */}
        {phase === 'error' && (
          <div className="px-5 py-8 space-y-5 text-center">
            <div className="flex size-16 mx-auto items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="size-8 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Test Needs a Retry</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-xl">
                Cancel
              </Button>
              <Button onClick={() => { setPhase('idle'); setPermissionDenied(false); setErrorMessage(''); }} className="flex-1 h-12 rounded-xl">
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* ── Complete ──────────────────────────────────────────────── */}
        {phase === 'complete' && analysis && (
          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            {/* AI Verdict */}
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-sm font-medium">AI is analysing your results…</span>
              </div>
            ) : aiVerdict ? (
              <Card
                className={
                  aiVerdict.verdict === 'sober'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : aiVerdict.verdict === 'slightly_impaired'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-destructive/30 bg-destructive/5'
                }
              >
                <CardContent className="p-4 text-center space-y-1.5">
                  <p className={`text-xl font-bold ${verdictColor}`}>{verdictLabel}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{aiVerdict.explanation}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center gap-2 text-emerald-500">
                <CheckCircle2 className="size-6" />
                <span className="font-bold text-base">Stability Check Complete</span>
              </div>
            )}

            {/* Metrics */}
            <details className="group" open>
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                View stats
              </summary>
              <div className="mt-2 space-y-1.5">
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Accel Std</span>
                    <span className="font-bold text-sm">{analysis.metrics!.accStd} m/s²</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Gyro Std</span>
                    <span className="font-bold text-sm">{analysis.metrics!.gyroStd} rad/s</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Jerk Mean</span>
                    <span className="font-bold text-sm">{analysis.metrics!.jerkMean} m/s³</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Lateral Sway</span>
                    <span className="font-bold text-sm">{analysis.metrics!.lateralStd} m/s²</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Samples</span>
                    <span className="font-bold text-sm">{analysis.metrics!.sampleCount}</span>
                  </CardContent>
                </Card>
              </div>
            </details>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setPhase('idle'); setAnalysis(null); setAiVerdict(null); setAiLoading(false); }}
                className="flex-1 h-12 rounded-xl"
                size="lg"
              >
                <Activity className="mr-2 size-5" />
                Retry
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 h-12 rounded-xl"
                size="lg"
                disabled={aiLoading}
              >
                <CheckCircle2 className="mr-2 size-5" />
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

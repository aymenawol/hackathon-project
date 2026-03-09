// ============================================================
// useFocusTest — orchestrates the 10-second dot-tracking test.
//
// Manages:
//  - camera stream lifecycle
//  - dot stimulus timing
//  - frame collection from FaceMesh
//  - metric extraction + scoring
// ============================================================

import { useRef, useState, useCallback } from "react";
import { FaceLandmarkData } from "./useFaceMesh";
import { FocusFrame, extractEyeMetrics, RawEyeMetrics } from "@/lib/eyeMetrics";
import {
  computeFocusScore,
  FocusScoreResult,
  loadFocusBaseline,
  saveFocusBaseline,
  updateFocusBaseline,
  FocusBaseline,
} from "@/lib/focusScore";

/** Duration of the tracking test in seconds. */
const TEST_DURATION = 10;
/** Dot oscillation frequency in Hz. */
const DOT_FREQ = 0.65;
/** Dot amplitude as fraction of [0,1] range. */
const DOT_AMPLITUDE = 0.3;

export type FocusTestPhase =
  | "idle"
  | "camera"       // waiting for camera
  | "calibrating"  // face-centering delay
  | "tracking"     // dot moving, collecting frames
  | "analyzing"    // computing metrics
  | "complete"     // done
  | "error";

export interface FocusTestResult {
  rawMetrics: RawEyeMetrics;
  score: FocusScoreResult;
  baseline: FocusBaseline;
}

/**
 * Compute the dot X position for a given elapsed time.
 * Returns normalised [0, 1] with 0.5 = centre.
 */
export function getDotX(elapsed: number): number {
  return 0.5 + DOT_AMPLITUDE * Math.sin(elapsed * DOT_FREQ * 2 * Math.PI);
}

/** Fixed Y for the dot stimulus. */
export const DOT_Y = 0.5;

export function useFocusTest() {
  const [phase, setPhase] = useState<FocusTestPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<FocusTestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const framesRef = useRef<FocusFrame[]>([]);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  // ---- Camera helpers -----
  const startCamera = useCallback(async (videoEl: HTMLVideoElement) => {
    setPhase("camera");
    setErrorMsg(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play();
      return true;
    } catch (err) {
      console.error("Camera error:", err);
      setPhase("error");
      setErrorMsg("Unable to access camera. Please allow camera permissions and try again.");
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ---- Recording a single landmark frame ----
  const recordFrame = useCallback((data: FaceLandmarkData) => {
    if (startTimeRef.current === 0) return;
    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    if (elapsed > TEST_DURATION) return;

    const dotX = getDotX(elapsed);
    framesRef.current.push({
      timestamp: elapsed,
      eyeX: data.pupilX,
      eyeY: data.pupilY,
      dotX,
      dotY: DOT_Y,
      headYaw: data.headYaw,
      headPitch: data.headPitch,
    });
  }, []);

  // ---- Begin the test (after calibration delay) ----
  const beginTracking = useCallback(() => {
    framesRef.current = [];
    startTimeRef.current = performance.now();
    setPhase("tracking");

    function tick() {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      if (elapsed >= TEST_DURATION) {
        finishTest();
        return;
      }
      setProgress((elapsed / TEST_DURATION) * 100);
      rafRef.current = requestAnimationFrame(tick);
    }

    function finishTest() {
      setPhase("analyzing");
      const frames = framesRef.current;
      const rawMetrics = extractEyeMetrics(frames);
      const baseline = loadFocusBaseline();
      const score = computeFocusScore(rawMetrics, baseline);

      setResult({ rawMetrics, score, baseline });

      // Clear raw frames immediately (privacy)
      framesRef.current = [];

      setTimeout(() => setPhase("complete"), 600);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ---- Calibration phase (2 s face-centering pause) ----
  const startCalibration = useCallback(() => {
    setPhase("calibrating");
    setTimeout(() => {
      beginTracking();
    }, 2000);
  }, [beginTracking]);

  // ---- Save current result as baseline update ----
  const saveAsBaseline = useCallback(() => {
    if (!result) return;
    const current = loadFocusBaseline();
    const updated = updateFocusBaseline(current, result.rawMetrics);
    saveFocusBaseline(updated);
  }, [result]);

  // ---- Teardown ----
  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopCamera();
    framesRef.current = [];
    startTimeRef.current = 0;
  }, [stopCamera]);

  // ---- Reset to idle ----
  const reset = useCallback(() => {
    cleanup();
    setPhase("idle");
    setProgress(0);
    setResult(null);
    setErrorMsg(null);
  }, [cleanup]);

  return {
    phase,
    progress,
    result,
    errorMsg,
    getDotX,
    startCamera,
    stopCamera,
    startCalibration,
    recordFrame,
    saveAsBaseline,
    cleanup,
    reset,
    TEST_DURATION,
  };
}

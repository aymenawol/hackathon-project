// ============================================================
// useFaceMesh — initialise MediaPipe FaceMesh and stream
// face-landmark results via a callback.
// ============================================================

import { useEffect, useRef, useCallback, useState } from "react";

/** Lightweight eye + head pose data extracted from landmarks. */
export interface FaceLandmarkData {
  /** Average pupil X (normalised 0-1, 0=left of image). */
  pupilX: number;
  /** Average pupil Y (normalised 0-1, 0=top). */
  pupilY: number;
  /** Approximate head yaw (normalised). */
  headYaw: number;
  /** Approximate head pitch (normalised). */
  headPitch: number;
  /** Detection confidence proxy (0-1). */
  confidence: number;
}

// Iris landmark indices (refineLandmarks: true)
const LEFT_IRIS = [468, 469, 470, 471];
const RIGHT_IRIS = [473, 474, 475, 476];
// Reference landmarks for head pose
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractData(results: any): FaceLandmarkData | null {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    return null;
  }
  const lm = results.multiFaceLandmarks[0];
  if (!lm || lm.length < 475) return null; // need iris landmarks

  // Pupil centre from iris landmarks
  const leftIrisX = mean(LEFT_IRIS.map((i) => lm[i].x));
  const leftIrisY = mean(LEFT_IRIS.map((i) => lm[i].y));
  const rightIrisX = mean(RIGHT_IRIS.map((i) => lm[i].x));
  const rightIrisY = mean(RIGHT_IRIS.map((i) => lm[i].y));

  const pupilX = (leftIrisX + rightIrisX) / 2;
  const pupilY = (leftIrisY + rightIrisY) / 2;

  // Head pose approximation
  const nose = lm[NOSE_TIP];
  const leftEye = lm[LEFT_EYE_OUTER];
  const rightEye = lm[RIGHT_EYE_OUTER];

  const headYaw = rightEye.x - leftEye.x;
  const midEyeY = (leftEye.y + rightEye.y) / 2;
  const headPitch = nose.y - midEyeY;

  // Confidence: use the z-depth spread of iris as a proxy for how well
  // the mesh tracked. A flat face (poor tracking) has near-zero spread.
  const zSpread = Math.abs(lm[LEFT_IRIS[0]].z - lm[RIGHT_IRIS[0]].z);
  const confidence = Math.min(1, zSpread * 20 + 0.5);

  return { pupilX, pupilY, headYaw, headPitch, confidence };
}

interface UseFaceMeshOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onResults: (data: FaceLandmarkData) => void;
  enabled: boolean;
}

/**
 * Hook that sets up MediaPipe FaceMesh and runs it against a
 * <video> element at ~30fps via requestAnimationFrame.
 *
 * Returns `{ ready, error }`.
 */
export function useFaceMesh({ videoRef, onResults, enabled }: UseFaceMeshOptions) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceMeshRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  // Initialise FaceMesh once (dynamic import to avoid SSR / module issues)
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import — @mediapipe/face_mesh is a UMD module
        const faceMeshModule = await import("@mediapipe/face_mesh");
        if (cancelled) return;

        const FaceMeshClass = faceMeshModule.FaceMesh ?? (faceMeshModule as any).default?.FaceMesh ?? (faceMeshModule as any).default;
        if (!FaceMeshClass) {
          throw new Error("Could not find FaceMesh constructor");
        }

        const fm = new FaceMeshClass({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fm.onResults((results: any) => {
          const data = extractData(results);
          if (data) {
            onResultsRef.current(data);
          }
        });

        await fm.initialize();
        if (cancelled) { fm.close(); return; }

        faceMeshRef.current = fm;
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("FaceMesh init failed:", err);
        setError("Failed to initialise face tracking. Please reload and try again.");
      }
    })();

    return () => {
      cancelled = true;
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      setReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Processing loop — send video frames to FaceMesh
  const startProcessing = useCallback(() => {
    const video = videoRef.current;
    const fm = faceMeshRef.current;
    if (!video || !fm) return;

    let running = true;

    async function loop() {
      if (!running) return;
      const v = videoRef.current;
      const mesh = faceMeshRef.current;
      if (v && mesh && v.readyState >= 2) {
        try {
          await mesh.send({ image: v });
        } catch {
          // frame skipped
        }
      }
      if (running) {
        rafRef.current = requestAnimationFrame(loop);
      }
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef]);

  const stopProcessing = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  return { ready, error, startProcessing, stopProcessing };
}

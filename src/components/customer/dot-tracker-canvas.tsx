"use client";

import { useEffect, useRef } from "react";

interface DotTrackerCanvasProps {
  /** Normalised dot X position (0-1). */
  dotX: number;
  /** Whether the dot is actively moving. */
  active: boolean;
}

/**
 * Full-width canvas that renders a smooth-pursuit target dot.
 * The dot is drawn every frame via requestAnimationFrame so it
 * doesn't depend on React re-renders for smooth motion.
 */
export function DotTrackerCanvas({ dotX, active }: DotTrackerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotXRef = useRef(dotX);
  dotXRef.current = dotX;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext("2d")!;
    let raf: number;

    function draw() {
      const c = canvasRef.current;
      if (!c) return;
      const w = c.width;
      const h = c.height;
      // HiDPI
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      if (c.width !== rect.width * dpr || c.height !== rect.height * dpr) {
        c.width = rect.width * dpr;
        c.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const cw = rect.width;
      const ch = rect.height;

      ctx.clearRect(0, 0, cw, ch);

      // Draw guide line
      ctx.strokeStyle = "rgba(128,128,128,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cw * 0.1, ch / 2);
      ctx.lineTo(cw * 0.9, ch / 2);
      ctx.stroke();

      // Draw dot
      const x = dotXRef.current * cw;
      const y = ch / 2;
      const radius = Math.min(14, cw * 0.03);

      // Glow
      ctx.beginPath();
      ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(99,102,241,0.15)";
      ctx.fill();

      // Main dot
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#6366f1";
      ctx.fill();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}

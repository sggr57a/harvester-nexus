/**
 * Reusable HUD primitives every launch variant composes from. Each one is
 * pure SVG / CSS and uses the unified design tokens declared on `.lv`,
 * so visual properties (stroke weight, opacity bucket, glow intensity,
 * timing curve) stay identical across variants.
 *
 * Effects modelled after the Envato HUD reference reel:
 *   - BlinkingCursor          → terminal-style ▮ cursor at 2-3 Hz
 *   - CountUpNumber           → animates 0 → target on mount
 *   - ChevronRing             → arrow-shaped dashed ring indicating spin direction
 *   - SegmentRing             → N discrete segments around a circle, K lit
 *   - TickingMarker           → marker that SNAPS (not spins) to discrete bearings
 *   - BracketCorners          → 4 corner brackets around any rectangular zone
 *   - ScanLine                → thin sweep that travels across a horizontal bar
 *   - CoordReadout            → micro-text coordinate snippet
 *   - MicroDotGrid            → 16-cell grid of blinking dots
 */

import { useEffect, useRef, useState } from 'react';

/* ============================================================
   BlinkingCursor — terminal-style ▮ cursor at ~2.5 Hz
   ============================================================ */
export function BlinkingCursor({ char = '▮', className }: { char?: string; className?: string }) {
  return <span className={`lv-cursor ${className ?? ''}`}>{char}</span>;
}

/* ============================================================
   CountUpNumber — animates 0 → target on mount, then snaps to live
   value updates after. Used for the centerpiece progress readouts.
   ============================================================ */
export function CountUpNumber({
  target,
  durationMs = 800,
  className,
}: {
  target: number;
  durationMs?: number;
  className?: string;
}) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number>(0);
  const targetRef = useRef(target);
  const animRef = useRef<number>(0);

  useEffect(() => {
    targetRef.current = target;
    startRef.current = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const startVal = val;
    const tick = () => {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startRef.current;
      const ratio = Math.min(1, t / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 2.4);
      setVal(startVal + (targetRef.current - startVal) * eased);
      if (ratio < 1) animRef.current = window.requestAnimationFrame(tick);
    };
    animRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return <span className={className}>{Math.round(val)}</span>;
}

/* ============================================================
   ChevronRing — chevron-shaped dashed ring; each chevron is a tiny
   arrow pointing in the direction of rotation. Use a `direction` prop
   to indicate CW vs CCW.
   ============================================================ */
export function ChevronRing({
  cx,
  cy,
  r,
  segments = 24,
  direction = 'cw',
  spin = 'var(--lv-spin-mid)',
  delayMs = 0,
}: {
  cx: number;
  cy: number;
  r: number;
  segments?: number;
  direction?: 'cw' | 'ccw';
  spin?: string;
  delayMs?: number;
}) {
  const items = [];
  const SIZE = 6;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    const rot = (angle * 180) / Math.PI + (direction === 'cw' ? 90 : -90);
    items.push(
      <polyline
        key={i}
        points={`${-SIZE / 2},${SIZE / 2} 0,${-SIZE / 2} ${SIZE / 2},${SIZE / 2}`}
        transform={`translate(${px} ${py}) rotate(${rot})`}
        className="lv-chevron"
      />,
    );
  }
  return (
    <g
      style={{
        transformOrigin: `${cx}px ${cy}px`,
        animation: `lv-spin ${spin} linear infinite${direction === 'ccw' ? ' reverse' : ''}, lv-panel-in var(--lv-fade-dur) var(--lv-easing) backwards ${delayMs}ms`,
      }}
    >
      {items}
    </g>
  );
}

/* ============================================================
   SegmentRing — ring of `segments` discrete arc segments, the first
   `lit` of which are highlighted. Used for circular progress bars.
   ============================================================ */
export function SegmentRing({
  cx,
  cy,
  r,
  segments,
  lit,
  thickness = 6,
  startAngle = -90,
  spread = 360,
  className,
}: {
  cx: number;
  cy: number;
  r: number;
  segments: number;
  lit: number;
  thickness?: number;
  startAngle?: number;
  spread?: number;
  className?: string;
}) {
  const segSweep = spread / segments;
  const arcs = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = startAngle + i * segSweep + 1;
    const a1 = startAngle + (i + 1) * segSweep - 1;
    arcs.push(
      <path
        key={i}
        d={arcPath(cx, cy, r, a0, a1)}
        strokeWidth={thickness}
        className={`lv-seg ${i < lit ? 'lv-seg-lit' : 'lv-seg-idle'} ${className ?? ''}`}
      />,
    );
  }
  return <g>{arcs}</g>;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(startDeg);
  const end = polar(endDeg);
  const x0 = cx + start.x * r;
  const y0 = cy + start.y * r;
  const x1 = cx + end.x * r;
  const y1 = cy + end.y * r;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function polar(deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/* ============================================================
   TickingMarker — marker that SNAPS to discrete bearings rather than
   rotating smoothly. The "quartz-watch second-hand" tick the reference
   video uses on sub-rings.
   ============================================================ */
export function TickingMarker({
  cx,
  cy,
  r,
  steps = 60,
  stepDurationMs = 90,
  size = 6,
  className,
}: {
  cx: number;
  cy: number;
  r: number;
  steps?: number;
  stepDurationMs?: number;
  size?: number;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % steps), stepDurationMs);
    return () => window.clearInterval(id);
  }, [steps, stepDurationMs]);
  const a = ((tick / steps) * 360 - 90) * (Math.PI / 180);
  const px = cx + Math.cos(a) * r;
  const py = cy + Math.sin(a) * r;
  return (
    <g transform={`translate(${px} ${py})`} className={`lv-ticking-marker ${className ?? ''}`}>
      <circle r={size} className="lv-tick-marker-glow" />
      <circle r={size * 0.5} className="lv-tick-marker-core" />
    </g>
  );
}

/* ============================================================
   BracketCorners — 4 corner brackets around any rectangular zone.
   Adds the "targeting reticle" framing the reference video uses
   liberally.
   ============================================================ */
export function BracketCorners({
  x,
  y,
  width,
  height,
  size = 10,
  className,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
  className?: string;
}) {
  return (
    <g className={`lv-brackets ${className ?? ''}`}>
      {/* top-left */}
      <polyline points={`${x},${y + size} ${x},${y} ${x + size},${y}`} />
      {/* top-right */}
      <polyline points={`${x + width - size},${y} ${x + width},${y} ${x + width},${y + size}`} />
      {/* bottom-left */}
      <polyline points={`${x},${y + height - size} ${x},${y + height} ${x + size},${y + height}`} />
      {/* bottom-right */}
      <polyline points={`${x + width - size},${y + height} ${x + width},${y + height} ${x + width},${y + height - size}`} />
    </g>
  );
}

/* ============================================================
   ScanLine — thin sweep that travels across a horizontal bar over
   `durationMs`. Used on top of progress bars to give them the "data
   transferring" feel.
   ============================================================ */
export function ScanLine({ durationMs = 1100 }: { durationMs?: number }) {
  return (
    <span
      className="lv-scanline"
      style={{ animationDuration: `${durationMs}ms` }}
      aria-hidden
    />
  );
}

/* ============================================================
   CoordReadout — micro-text coordinate snippet that adds density to
   any frame. Random-but-stable for a given `seed`.
   ============================================================ */
export function CoordReadout({ seed, className }: { seed: number; className?: string }) {
  // Deterministic synthetic coordinate so each instance has a stable label
  // but the screen has plausible variety.
  const lat = (Math.sin(seed * 0.31) * 89).toFixed(3);
  const lng = (Math.cos(seed * 0.47) * 179).toFixed(3);
  const grid = (Math.floor(((seed * 9301) + 49297) % 233280)).toString(16).toUpperCase().padStart(4, '0');
  return (
    <span className={`lv-coord ${className ?? ''}`}>
      [{lat}°, {lng}°] grid {grid}
    </span>
  );
}

/* ============================================================
   MicroDotGrid — small N-wide × M-tall grid of dots, a random subset
   of which blink at 2-3 Hz. Adds 'live data' texture to corners.
   ============================================================ */
export function MicroDotGrid({ cols = 16, rows = 4 }: { cols?: number; rows?: number }) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const litSeed = (r * cols + c) * 137 % 100;
      const lit = litSeed < 35;
      const delay = ((r * cols + c) * 71) % 1800;
      cells.push(
        <span
          key={`${r}-${c}`}
          className={`lv-dot ${lit ? 'lit' : ''}`}
          style={{ animationDelay: `${delay}ms` }}
        />,
      );
    }
  }
  return (
    <div className="lv-dot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 4px)` }}>
      {cells}
    </div>
  );
}

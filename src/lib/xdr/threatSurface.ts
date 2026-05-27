/**
 * Threat Surface — projects a stream of `Alert`s onto a 2-D heightmap whose
 * axes are (endpoints × MITRE ATT&CK tactics). The Z value at each cell is
 * the time-decayed, severity-weighted alert load, which is exactly what a
 * SOC operator wants to see "rising" as an attack progresses through the
 * kill chain on a particular endpoint.
 *
 * This module is pure — no DOM, no React, no SVG. It produces a `Float32Array`
 * grid that the `ThreatSurface3D` widget projects onto the screen, and a few
 * derived KPIs (argmax cell, severity histogram, sweep-trigger timestamp).
 */

import type { Alert, AttackTactic, Endpoint, Severity } from './types';

/** The 14 tactics that form the Y-axis of the surface. Order matters —
 * `reconnaissance` at the front, `impact` at the back, mirroring the
 * MITRE ATT&CK kill-chain progression. */
export const TACTIC_ORDER: AttackTactic[] = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
];

const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 0.2,
  low: 0.4,
  medium: 0.7,
  high: 1.1,
  critical: 1.6,
};

export function severityWeight(s: Severity): number {
  return SEVERITY_WEIGHT[s];
}

export interface ThreatSurfaceInput {
  alerts: Alert[];
  endpoints: Endpoint[];
  /** Half-life in milliseconds — alerts decay to 50 % of their height after
   *  this many ms. Default 5 minutes which keeps a SOC view "live" without
   *  losing the most recent kill-chain context. */
  halfLifeMs?: number;
  /** Reference time for decay (defaults to `Date.now()`). Pass an explicit
   *  value in tests to keep the projection deterministic. */
  nowMs?: number;
}

export interface ThreatSurfaceCell {
  endpointIndex: number;
  tacticIndex: number;
  endpointId: string;
  tactic: AttackTactic;
  /** Decayed severity-weighted alert load. Roughly 0..3 in normal SOC ops. */
  height: number;
  /** Highest severity contributing to this cell (drives colour). */
  topSeverity: Severity;
}

export interface ThreatSurface {
  /** Row-major grid of cell heights, length = endpoints.length × TACTIC_ORDER.length. */
  heights: Float32Array;
  /** Same shape as `heights`, the highest severity recorded into each cell. */
  topSeverity: Severity[];
  endpoints: Endpoint[];
  tactics: AttackTactic[];
  /** Highest cell on the surface — the SOC's "lock-on" target. `null` if
   *  every cell is empty. */
  peak: ThreatSurfaceCell | null;
  /** Aggregate alert load across the whole surface — drives the bottom dials. */
  totalLoad: number;
  /** Histogram of severities present on the surface — drives the bottom dials. */
  severityHistogram: Record<Severity, number>;
}

/** Project a list of alerts onto a `(endpoint × tactic)` heightmap. */
export function projectThreatSurface(input: ThreatSurfaceInput): ThreatSurface {
  const { alerts, endpoints } = input;
  const halfLifeMs = input.halfLifeMs ?? 5 * 60 * 1000;
  const now = input.nowMs ?? Date.now();
  const decayK = Math.LN2 / halfLifeMs;

  const tactics = TACTIC_ORDER;
  const cols = endpoints.length;
  const rows = tactics.length;
  const heights = new Float32Array(cols * rows);
  const topSeverity: Severity[] = new Array(cols * rows).fill('info');
  const severityRank: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const epIndexById = new Map(endpoints.map((e, i) => [e.id, i]));
  const tacticIndexById = new Map(tactics.map((t, i) => [t, i]));

  const histogram: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  let totalLoad = 0;

  for (const alert of alerts) {
    const ei = epIndexById.get(alert.endpointId);
    if (ei === undefined) continue;
    const ageMs = Math.max(0, now - alert.timestampMs);
    const decay = Math.exp(-decayK * ageMs);
    const w = severityWeight(alert.severity) * decay;
    if (w <= 0) continue;
    histogram[alert.severity] += 1;
    for (const tactic of alert.tactics) {
      const ti = tacticIndexById.get(tactic);
      if (ti === undefined) continue;
      const idx = ei * rows + ti;
      heights[idx] += w;
      totalLoad += w;
      if (severityRank[alert.severity] > severityRank[topSeverity[idx]]) {
        topSeverity[idx] = alert.severity;
      }
    }
  }

  let peak: ThreatSurfaceCell | null = null;
  for (let ei = 0; ei < cols; ei += 1) {
    for (let ti = 0; ti < rows; ti += 1) {
      const idx = ei * rows + ti;
      const h = heights[idx];
      if (h <= 0) continue;
      if (!peak || h > peak.height) {
        peak = {
          endpointIndex: ei,
          tacticIndex: ti,
          endpointId: endpoints[ei].id,
          tactic: tactics[ti],
          height: h,
          topSeverity: topSeverity[idx],
        };
      }
    }
  }

  return { heights, topSeverity, endpoints, tactics, peak, totalLoad, severityHistogram: histogram };
}

/** Top-N cells on the surface, sorted by height descending. Used by the
 *  widget's right-hand "TOP TALKERS" sidebar. */
export function topCells(surface: ThreatSurface, n: number): ThreatSurfaceCell[] {
  const out: ThreatSurfaceCell[] = [];
  const rows = surface.tactics.length;
  for (let ei = 0; ei < surface.endpoints.length; ei += 1) {
    for (let ti = 0; ti < rows; ti += 1) {
      const idx = ei * rows + ti;
      const h = surface.heights[idx];
      if (h <= 0) continue;
      out.push({
        endpointIndex: ei,
        tacticIndex: ti,
        endpointId: surface.endpoints[ei].id,
        tactic: surface.tactics[ti],
        height: h,
        topSeverity: surface.topSeverity[idx],
      });
    }
  }
  out.sort((a, b) => b.height - a.height);
  return out.slice(0, n);
}

/** Map a cell height to a hex colour using the canonical severity ramp.
 *  Empty cells are dim indigo, peak cells saturate to red. */
export function heightToColour(height: number): string {
  if (height <= 0) return 'rgb(26, 31, 58)';
  const stops: Array<{ at: number; rgb: [number, number, number] }> = [
    { at: 0.0, rgb: [26, 31, 58] },
    { at: 0.4, rgb: [78, 200, 255] },
    { at: 0.9, rgb: [80, 220, 130] },
    { at: 1.5, rgb: [249, 198, 74] },
    { at: 2.2, rgb: [255, 140, 74] },
    { at: 3.0, rgb: [255, 77, 109] },
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (height <= b.at) {
      const t = (height - a.at) / Math.max(1e-6, b.at - a.at);
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t);
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t);
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return 'rgb(255, 77, 109)';
}

/** Project world coordinates `(x, y, z)` onto screen coordinates using a
 *  cabinet projection — stable, no perspective distortion at the edges
 *  (which would make the surface look bowed). The widget uses this to
 *  render the wireframe + point cloud. */
export interface IsoProjectInput {
  x: number; y: number; z: number;
  cellWidth: number;
  cellDepth: number;
  heightScale: number;
  /** Pitch in radians — 0 is fully top-down, π/2 is side-on. ~0.55 rad
   *  matches the source video. */
  pitch: number;
}

export interface IsoPoint { sx: number; sy: number; }

export function isoProject({ x, y, z, cellWidth, cellDepth, heightScale, pitch }: IsoProjectInput): IsoPoint {
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const sx = (x - y) * cellWidth * 0.866;
  const sy = (x + y) * cellDepth * 0.5 * cosP - z * heightScale * sinP;
  return { sx, sy };
}

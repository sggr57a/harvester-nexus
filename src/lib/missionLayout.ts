/**
 * Mission Control layout persistence.
 *
 * Stores per-user widget positions for the customizable Mission Control
 * grid. Pure data — no React, no DOM. Three responsibilities:
 *
 *   1. Hold the canonical default layout that mirrors the current
 *      `mission-grid` CSS arrangement.
 *   2. Read / write user customizations to `localStorage` with a
 *      versioned key so older layouts that don't match the current
 *      widget catalogue are discarded gracefully.
 *   3. Expose helpers to compare a stored layout against the default
 *      so the cockpit can offer a "Reset" CTA when customizations exist.
 *
 * The widget catalogue here MUST stay in lock-step with the JSX in
 * `MissionControl.tsx` — adding / removing a widget requires bumping
 * `LAYOUT_VERSION` so stored layouts get rebuilt rather than render
 * with phantom cells.
 */

import type { Layout } from 'react-grid-layout';

/** Stable identifier for each Mission Control widget. Maps 1-to-1 to
 *  the JSX panels via `data-grid={{ i: <id> }}`. */
export type MissionWidgetId =
  | 'radial'
  | 'osc'
  | 'dials'
  | 'meters'
  | 'ring-cluster'
  | 'anomaly'
  | 'map'
  | 'feed'
  | 'heatmap'
  | 'activity'
  | 'sparkgrid'
  | 'gitops'
  | 'gpus'
  | 'api'
  | 'bars-storage'
  | 'bars-passthrough'
  | 'stack-mix'
  | 'flow-vlan'
  | 'fft'
  | 'pctile'
  | 'stacked-mix'
  | 'flow-mesh'
  | 'statgrid';

export interface MissionWidgetMeta {
  id: MissionWidgetId;
  /** Display name shown in the customize-mode badge / move handle. */
  title: string;
  /** Default 12-column grid placement. `x` is column index 0..11,
   *  `w` is column count, `h` is row count, `y` is row index. RGL
   *  rowHeight is fixed at 30 px so `h` is in 30-px units (with a
   *  4 px gap accounted for by RGL margin). */
  default: { x: number; y: number; w: number; h: number };
  /** Minimum dimensions when resizing — keeps each widget legible
   *  even at tightest squeeze. */
  minW?: number;
  minH?: number;
}

/** Bump this whenever the widget catalogue changes (additions, removals,
 *  or material default-position changes). Stored layouts pinned to an
 *  older version are discarded on next render and the user gets the
 *  fresh defaults. */
export const LAYOUT_VERSION = 1;

/** The canonical default arrangement. Mirrors the current
 *  `.mission-grid` CSS column-spans with reasonable row-spans for
 *  each widget's natural content height. */
export const MISSION_WIDGETS: MissionWidgetMeta[] = [
  { id: 'radial',           title: 'Cluster posture rings',           default: { x: 0,  y: 0,  w: 3, h: 10 }, minW: 2, minH: 7 },
  { id: 'osc',              title: 'Oscilloscope',                    default: { x: 3,  y: 0,  w: 5, h: 10 }, minW: 3, minH: 7 },
  { id: 'dials',            title: 'Cluster dial gauges',             default: { x: 8,  y: 0,  w: 4, h: 8  }, minW: 3, minH: 6 },
  { id: 'meters',           title: 'Fleet CPU level meters',          default: { x: 8,  y: 8,  w: 4, h: 6  }, minW: 3, minH: 5 },

  { id: 'ring-cluster',     title: 'Storage backend rings',           default: { x: 0,  y: 10, w: 4, h: 8  }, minW: 3, minH: 6 },
  { id: 'anomaly',          title: 'Anomaly stream',                  default: { x: 4,  y: 10, w: 4, h: 6  }, minW: 3, minH: 4 },
  { id: 'map',              title: 'Cluster topology · 3D pillars',   default: { x: 0,  y: 18, w: 5, h: 12 }, minW: 4, minH: 8 },
  { id: 'feed',             title: 'Live event log',                  default: { x: 5,  y: 18, w: 4, h: 10 }, minW: 3, minH: 6 },

  { id: 'heatmap',          title: 'Node activity heatmap',           default: { x: 4,  y: 16, w: 4, h: 6  }, minW: 3, minH: 4 },
  { id: 'activity',         title: 'Workload activity timeline',      default: { x: 0,  y: 30, w: 6, h: 6  }, minW: 4, minH: 4 },
  { id: 'sparkgrid',        title: '12-channel signal grid',          default: { x: 6,  y: 30, w: 6, h: 8  }, minW: 4, minH: 5 },

  { id: 'gitops',           title: 'GitOps sync state bank',          default: { x: 8,  y: 14, w: 4, h: 8  }, minW: 3, minH: 5 },
  { id: 'gpus',             title: 'GPU memory grid',                 default: { x: 0,  y: 36, w: 4, h: 8  }, minW: 3, minH: 5 },
  { id: 'api',              title: 'API rate gauges',                 default: { x: 4,  y: 36, w: 4, h: 8  }, minW: 3, minH: 5 },

  { id: 'bars-storage',     title: 'Storage backends · live IOPS',    default: { x: 8,  y: 22, w: 4, h: 6  }, minW: 3, minH: 4 },
  { id: 'bars-passthrough', title: 'GPU / FPGA / smart-NIC',          default: { x: 8,  y: 28, w: 4, h: 6  }, minW: 3, minH: 4 },
  { id: 'stack-mix',        title: 'Workload mix · last 32 ticks',    default: { x: 8,  y: 36, w: 4, h: 6  }, minW: 3, minH: 4 },

  { id: 'flow-vlan',        title: 'VLAN → service mesh ribbons',     default: { x: 0,  y: 44, w: 6, h: 8  }, minW: 4, minH: 5 },
  { id: 'fft',              title: 'Network spectrum (DPDK)',         default: { x: 6,  y: 44, w: 6, h: 8  }, minW: 4, minH: 5 },

  { id: 'pctile',           title: 'Service-mesh latency bands',      default: { x: 0,  y: 52, w: 6, h: 6  }, minW: 4, minH: 4 },
  { id: 'stacked-mix',      title: 'Workload mix over time',          default: { x: 6,  y: 52, w: 6, h: 6  }, minW: 4, minH: 4 },
  { id: 'flow-mesh',        title: 'Service mesh flow',               default: { x: 0,  y: 58, w: 6, h: 8  }, minW: 4, minH: 5 },
  { id: 'statgrid',         title: 'Stat grid',                       default: { x: 6,  y: 58, w: 6, h: 8  }, minW: 4, minH: 5 },
];

const STORAGE_KEY = `nexus.missionControl.layout.v${LAYOUT_VERSION}`;

export function defaultLayout(): Layout[] {
  return MISSION_WIDGETS.map((w) => ({
    i: w.id,
    x: w.default.x,
    y: w.default.y,
    w: w.default.w,
    h: w.default.h,
    minW: w.minW,
    minH: w.minH,
  }));
}

export function readLayout(): Layout[] {
  if (typeof window === 'undefined') return defaultLayout();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultLayout();
  try {
    const parsed = JSON.parse(raw) as Layout[];
    // Discard stored layouts that reference unknown widget ids.
    const known = new Set(MISSION_WIDGETS.map((w) => w.id as string));
    const stored = parsed.filter((l) => known.has(l.i));
    // Also splice in any defaults that the stored layout is missing
    // (e.g. when LAYOUT_VERSION wasn't bumped but a widget was added).
    const storedIds = new Set(stored.map((l) => l.i));
    for (const w of MISSION_WIDGETS) {
      if (!storedIds.has(w.id)) {
        stored.push({ i: w.id, x: w.default.x, y: w.default.y, w: w.default.w, h: w.default.h, minW: w.minW, minH: w.minH });
      }
    }
    return stored;
  } catch {
    return defaultLayout();
  }
}

export function writeLayout(layout: Layout[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export function clearLayout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Return true when the supplied layout differs from the canonical default
 *  in any widget's position or size. Used to gate the "Reset layout" CTA. */
export function isCustomized(layout: Layout[]): boolean {
  const defaultMap = new Map(defaultLayout().map((l) => [l.i, l]));
  for (const l of layout) {
    const d = defaultMap.get(l.i);
    if (!d) return true;
    if (d.x !== l.x || d.y !== l.y || d.w !== l.w || d.h !== l.h) return true;
  }
  return false;
}

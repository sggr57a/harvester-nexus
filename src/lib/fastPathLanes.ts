/**
 * Fast-path data-plane lane health projection.
 *
 * Maps each `FastPathLaneSample` from the live telemetry into a HUD-shaped
 * structure with discrete "segments" (the visual idiom of segmented
 * concentric arcs from the futuristic-HUD aesthetic) plus a derived
 * health bucket per lane.
 */

import type { FastPathLaneSample } from './liveTelemetry';

export type LaneHealthStatus = 'optimal' | 'busy' | 'backlog' | 'drop';

export interface FastPathLaneView {
  id: FastPathLaneSample['id'];
  label: string;
  /** Raw queue depth from the sample. */
  queueDepth: number;
  /** Maximum queue depth at which the lane is fully backed-up. */
  queueCapacity: number;
  /** 0..1 — fraction of queue capacity currently in use. */
  queueFill: number;
  /** Number of segments to draw (always 12 for the HUD style). */
  segmentCount: number;
  /** Number of segments lit — proportional to queue fill. */
  segmentsLit: number;
  /** Segments showing as warning (queue near capacity). */
  segmentsWarning: number;
  /** Segments showing as critical (drops in this tick). */
  segmentsCritical: number;
  /** IOPS sustained on this lane. */
  iops: number;
  /** Drop count in the current tick — non-zero means the lane shed work. */
  drops: number;
  /** Polled-mode wakeup or IRQ rate per second. */
  irqRate: number;
  /** Health bucket — drives the gauge colour. */
  status: LaneHealthStatus;
}

const SEGMENT_COUNT = 12;

export function projectFastPathLanes(lanes: FastPathLaneSample[]): FastPathLaneView[] {
  return lanes.map((lane) => {
    const queueFill = Math.max(0, Math.min(1, lane.queueDepth / Math.max(1, lane.queueCapacity)));
    let segmentsLit = Math.round(queueFill * SEGMENT_COUNT);
    let segmentsWarning = 0;
    let segmentsCritical = 0;

    let status: LaneHealthStatus;
    if (lane.drops > 0) {
      status = 'drop';
      segmentsCritical = Math.max(1, Math.round(Math.min(SEGMENT_COUNT, lane.drops) * 0.6));
      segmentsLit = SEGMENT_COUNT;
    } else if (queueFill >= 0.85) {
      status = 'backlog';
      segmentsWarning = Math.max(1, Math.round((queueFill - 0.7) * SEGMENT_COUNT));
    } else if (queueFill >= 0.5) {
      status = 'busy';
    } else {
      status = 'optimal';
    }

    return {
      id: lane.id,
      label: lane.label,
      queueDepth: lane.queueDepth,
      queueCapacity: lane.queueCapacity,
      queueFill,
      segmentCount: SEGMENT_COUNT,
      segmentsLit,
      segmentsWarning,
      segmentsCritical,
      iops: lane.iops,
      drops: lane.drops,
      irqRate: lane.irqRate,
      status,
    };
  });
}

/** Sum IOPS across all lanes — useful for the centre readout. */
export function totalLaneIops(views: FastPathLaneView[]): number {
  return views.reduce((s, v) => s + v.iops, 0);
}

/** Number of lanes currently dropping work — drives the lane-bank
 *  status badge. */
export function lanesInDrop(views: FastPathLaneView[]): number {
  return views.filter((v) => v.status === 'drop').length;
}

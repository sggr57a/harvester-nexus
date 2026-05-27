/**
 * Deception / honeypot radar projection.
 *
 * Filters the engine's alert stream to honeypot-touch events
 * (`source === 'opencanary'`) and projects each onto a polar coordinate
 * suitable for a radar widget — bearing from the source IP's
 * geo-attribution, range from the alert's age. Pure data.
 */

import type { Alert, Endpoint } from './xdr/types';

export interface DeceptionPing {
  id: string;
  /** Bearing (degrees, 0 = north, clockwise). */
  bearing: number;
  /** Distance from the radar centre 0..1. Recent pings are close to the
   *  edge; older pings have decayed inward. */
  range: number;
  /** Severity bucket → drives the ping colour. */
  severity: Alert['severity'];
  /** Endpoint that the honeypot is deployed on. */
  endpointId: string;
  /** Source IP that touched the honeypot. */
  sourceIp: string;
  /** Honeypot service that was touched. */
  service: string;
  /** Age in milliseconds. */
  ageMs: number;
}

/** Geo-attribution map — same source-IP table the XDR engine uses for
 *  threat attribution. Centralised so the radar uses the same data the
 *  engine does. */
const COUNTRY_BEARINGS: Record<string, number> = {
  '203.0.113.61': 32,    // Saint Petersburg → ~NE
  '198.51.100.7': 78,    // Pyongyang → E-NE
  '203.0.113.84': 100,   // Tehran → E-SE
  '198.51.100.42': 62,   // Shanghai → E
  '203.0.113.140': 154,  // Lagos → S-SE
  '198.51.100.219': 220, // Brasília → SW
  '203.0.113.22': 88,    // Hanoi → E
  '198.51.100.198': 246, // Caracas → W-SW
};

/** Hash an unknown IP into a stable bearing 0..360. Keeps the radar from
 *  collapsing all unknown IPs onto bearing 0. */
function fallbackBearing(ip: string): number {
  let h = 2166136261;
  for (let i = 0; i < ip.length; i += 1) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360);
}

export interface ProjectDeceptionInput {
  alerts: Alert[];
  endpoints: Endpoint[];
  nowMs?: number;
  /** Pings older than this fully fall off the radar. Default 5 min. */
  fadeMs?: number;
}

export function projectDeceptionRadar({
  alerts,
  endpoints,
  nowMs = Date.now(),
  fadeMs = 5 * 60_000,
}: ProjectDeceptionInput): DeceptionPing[] {
  const epIds = new Set(endpoints.map((e) => e.id));
  const out: DeceptionPing[] = [];
  for (const a of alerts) {
    if (a.triggeringEvent.kind !== 'honeypot-touch' && a.triggeringEvent.source !== 'opencanary') continue;
    if (a.endpointId && !epIds.has(a.endpointId)) continue;
    const ageMs = Math.max(0, nowMs - a.timestampMs);
    if (ageMs >= fadeMs) continue;
    const ip = a.triggeringEvent.remoteIp ?? '0.0.0.0';
    const bearing = COUNTRY_BEARINGS[ip] ?? fallbackBearing(ip);
    // Range: 1.0 = freshest (rim), 0.05 = about to fall off.
    const range = Math.max(0.05, 1 - ageMs / fadeMs);
    out.push({
      id: a.id,
      bearing,
      range,
      severity: a.severity,
      endpointId: a.endpointId,
      sourceIp: ip,
      service: typeof a.triggeringEvent.payload?.service === 'string' ? a.triggeringEvent.payload.service : 'tcp',
      ageMs,
    });
  }
  // Sort by range descending so freshest pings render last (on top).
  out.sort((a, b) => a.range - b.range);
  return out;
}

/** Convert (bearing, range) to an SVG (x, y) inside a unit circle centred
 *  at (0, 0). 0 deg points up. */
export function polarToCartesian(bearing: number, range: number): { x: number; y: number } {
  const theta = (bearing - 90) * (Math.PI / 180); // shift so 0 = up
  return {
    x: Math.cos(theta) * range,
    y: Math.sin(theta) * range,
  };
}

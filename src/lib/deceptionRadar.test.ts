import { describe, expect, it } from 'vitest';
import { polarToCartesian, projectDeceptionRadar } from './deceptionRadar';
import type { Alert, Endpoint } from './xdr/types';

const NOW = 1_700_000_000_000;

function ep(id: string): Endpoint {
  return { id, name: id, kind: 'edge', host: id, ip: '10.0.0.1', sensors: ['opencanary'], status: 'online' };
}

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    ruleId: 'NXR-0002-honeypot-touch',
    ruleTitle: 'Honeypot interaction',
    endpointId: 'edge-a',
    severity: 'high',
    tactics: ['discovery'],
    techniques: ['T1046'],
    triggeringEvent: {
      id: 'e1',
      source: 'opencanary',
      endpointId: 'edge-a',
      kind: 'honeypot-touch',
      timestampMs: NOW,
      remoteIp: '203.0.113.61',
      payload: { service: 'ssh' },
    },
    matchedIndicators: [],
    recommendedActions: ['isolate-endpoint'],
    responseStatus: 'pending',
    timestampMs: NOW,
    ...over,
  };
}

describe('deceptionRadar · projectDeceptionRadar', () => {
  it('drops alerts that are not honeypot-touch', () => {
    const pings = projectDeceptionRadar({
      alerts: [alert({ triggeringEvent: { ...alert().triggeringEvent, kind: 'process-exec', source: 'falco' } })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    expect(pings).toHaveLength(0);
  });

  it('drops alerts referencing an unknown endpoint', () => {
    const pings = projectDeceptionRadar({
      alerts: [alert({ endpointId: 'ghost' })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    expect(pings).toHaveLength(0);
  });

  it('drops alerts older than fadeMs', () => {
    const pings = projectDeceptionRadar({
      alerts: [alert({ timestampMs: NOW - 10 * 60_000 })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
      fadeMs: 5 * 60_000,
    });
    expect(pings).toHaveLength(0);
  });

  it('fresh alert has range close to 1', () => {
    const pings = projectDeceptionRadar({
      alerts: [alert({ timestampMs: NOW })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    expect(pings[0].range).toBeCloseTo(1, 2);
  });

  it('aged alert range linearly approaches 0.05', () => {
    const fade = 60_000;
    const pings = projectDeceptionRadar({
      alerts: [alert({ timestampMs: NOW - fade * 0.5 })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
      fadeMs: fade,
    });
    expect(pings[0].range).toBeCloseTo(0.5, 2);
  });

  it('known IPs map to the documented bearings', () => {
    const pings = projectDeceptionRadar({
      alerts: [
        alert({ id: 'a-rs', triggeringEvent: { ...alert().triggeringEvent, remoteIp: '203.0.113.61' } }),
        alert({ id: 'a-kp', triggeringEvent: { ...alert().triggeringEvent, remoteIp: '198.51.100.7' } }),
        alert({ id: 'a-ir', triggeringEvent: { ...alert().triggeringEvent, remoteIp: '203.0.113.84' } }),
      ],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    const byIp = new Map(pings.map((p) => [p.sourceIp, p.bearing]));
    expect(byIp.get('203.0.113.61')).toBe(32);
    expect(byIp.get('198.51.100.7')).toBe(78);
    expect(byIp.get('203.0.113.84')).toBe(100);
  });

  it('unknown IPs are hashed to a stable bearing', () => {
    const a = projectDeceptionRadar({
      alerts: [alert({ id: 'a1', triggeringEvent: { ...alert().triggeringEvent, remoteIp: '8.8.8.8' } })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    const b = projectDeceptionRadar({
      alerts: [alert({ id: 'a2', triggeringEvent: { ...alert().triggeringEvent, remoteIp: '8.8.8.8' } })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    expect(a[0].bearing).toBe(b[0].bearing);
    expect(a[0].bearing).toBeGreaterThanOrEqual(0);
    expect(a[0].bearing).toBeLessThan(360);
  });

  it('captures honeypot service name from the payload', () => {
    const pings = projectDeceptionRadar({
      alerts: [alert({ triggeringEvent: { ...alert().triggeringEvent, payload: { service: 'http' } } })],
      endpoints: [ep('edge-a')],
      nowMs: NOW,
    });
    expect(pings[0].service).toBe('http');
  });
});

describe('deceptionRadar · polarToCartesian', () => {
  it('bearing 0 (north) places the point at (0, -range)', () => {
    const p = polarToCartesian(0, 1);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-1, 6);
  });

  it('bearing 90 (east) places the point at (+range, 0)', () => {
    const p = polarToCartesian(90, 1);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('bearing 180 (south) places the point at (0, +range)', () => {
    const p = polarToCartesian(180, 1);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1, 6);
  });

  it('range 0 collapses to the origin regardless of bearing', () => {
    const p = polarToCartesian(123, 0);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
});

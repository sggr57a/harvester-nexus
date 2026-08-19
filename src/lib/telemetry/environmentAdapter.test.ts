import { describe, expect, it } from 'vitest';
import {
  formatMetric,
  isMetricUnavailable,
  payloadToEnvironmentSnapshot,
} from './environmentAdapter';
import type { EnvironmentTelemetryPayload } from './types';

function payload(overrides: Partial<EnvironmentTelemetryPayload> = {}): EnvironmentTelemetryPayload {
  return {
    totalWorkloads: 4,
    totalIops: 1200,
    ingressMbps: 40,
    egressMbps: 30,
    cpuPercent: 22,
    ramPercent: 51,
    watts: 410,
    activeMigrations: 0,
    openCves: 3,
    trustScore: 88,
    tick: 1,
    source: 'metrics-server',
    clusterReady: true,
    monitoringEnabled: true,
    nodeCount: 3,
    podCount: 4,
    vmCount: 0,
    ...overrides,
  };
}

describe('payloadToEnvironmentSnapshot', () => {
  it('passes real measurements through untouched', () => {
    const snap = payloadToEnvironmentSnapshot(payload());
    expect(snap.cpuPercent).toBe(22);
    expect(snap.watts).toBe(410);
    expect(snap.trustScore).toBe(88);
    expect(snap.unavailableMetrics).toEqual([]);
  });

  it('records null metrics as unavailable rather than silently reporting 0', () => {
    const snap = payloadToEnvironmentSnapshot(
      payload({ watts: null, cpuPercent: null, trustScore: null }),
    );
    expect(snap.unavailableMetrics).toEqual(
      expect.arrayContaining(['watts', 'cpuPercent', 'trustScore']),
    );
    expect(isMetricUnavailable(snap, 'watts')).toBe(true);
    expect(isMetricUnavailable(snap, 'ramPercent')).toBe(false);
  });

  it('distinguishes a measured zero from an unmeasurable metric', () => {
    const measuredZero = payloadToEnvironmentSnapshot(payload({ totalIops: 0 }));
    const unmeasurable = payloadToEnvironmentSnapshot(payload({ totalIops: null }));

    // Both carry 0 numerically, but only one is a real reading.
    expect(measuredZero.totalIops).toBe(0);
    expect(unmeasurable.totalIops).toBe(0);
    expect(isMetricUnavailable(measuredZero, 'totalIops')).toBe(false);
    expect(isMetricUnavailable(unmeasurable, 'totalIops')).toBe(true);
  });

  it('suppresses deltas for metrics that are unavailable on either tick', () => {
    const first = payloadToEnvironmentSnapshot(payload({ watts: 400 }));
    const second = payloadToEnvironmentSnapshot(payload({ watts: null }), first);
    // 0 - 400 would imply a 400 W drop that was never measured.
    expect(second.deltas.watts).toBe(0);

    const third = payloadToEnvironmentSnapshot(payload({ watts: 420 }), second);
    expect(third.deltas.watts).toBe(0);

    const fourth = payloadToEnvironmentSnapshot(payload({ watts: 450 }), third);
    expect(fourth.deltas.watts).toBe(30);
  });

  it('still reports deltas for metrics that remain available', () => {
    const first = payloadToEnvironmentSnapshot(payload({ cpuPercent: 20 }));
    const second = payloadToEnvironmentSnapshot(payload({ cpuPercent: 26 }), first);
    expect(second.deltas.cpuPercent).toBe(6);
  });

  it('carries per-metric provenance through to the snapshot', () => {
    const snap = payloadToEnvironmentSnapshot(
      payload({ metricSources: { cpu: 'metrics-server', watts: 'unavailable' } }),
    );
    expect(snap.metricSources?.cpu).toBe('metrics-server');
  });
});

describe('formatMetric', () => {
  it('formats an available metric', () => {
    const snap = payloadToEnvironmentSnapshot(payload({ watts: 410 }));
    expect(formatMetric(snap, 'watts', (v) => `${v} W`)).toBe('410 W');
  });

  it('renders a placeholder instead of a fabricated number', () => {
    const snap = payloadToEnvironmentSnapshot(payload({ watts: null }));
    expect(formatMetric(snap, 'watts', (v) => `${v} W`)).toBe('—');
    expect(formatMetric(undefined, 'watts', (v) => `${v} W`)).toBe('—');
  });
});

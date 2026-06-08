import { describe, expect, it } from 'vitest';
import { payloadToEnvironmentSnapshot } from './environmentAdapter';
import { resolveTelemetryMode } from './mode';
import type { EnvironmentTelemetryPayload } from './types';

const samplePayload: EnvironmentTelemetryPayload = {
  totalWorkloads: 42,
  totalIops: 120000,
  ingressMbps: 900,
  egressMbps: 850,
  cpuPercent: 33.5,
  ramPercent: 61.2,
  watts: 440,
  activeMigrations: 1,
  openCves: 3,
  trustScore: 91,
  tick: 5,
  source: 'metrics-server',
  clusterReady: true,
  monitoringEnabled: true,
  nodeCount: 2,
  podCount: 38,
  vmCount: 4,
};

describe('telemetry mode', () => {
  it('forces demo when requested demo', () => {
    expect(resolveTelemetryMode('demo', true)).toBe('demo');
    expect(resolveTelemetryMode('demo', false)).toBe('demo');
  });

  it('uses live in auto when API is available', () => {
    expect(resolveTelemetryMode('auto', true)).toBe('live');
    expect(resolveTelemetryMode('auto', false)).toBe('demo');
  });

  it('falls back to demo when live requested but unavailable', () => {
    expect(resolveTelemetryMode('live', false)).toBe('demo');
  });
});

describe('payloadToEnvironmentSnapshot', () => {
  it('maps API payload into EnvironmentSnapshot', () => {
    const snap = payloadToEnvironmentSnapshot(samplePayload);
    expect(snap.totalWorkloads).toBe(42);
    expect(snap.cpuPercent).toBe(33.5);
    expect(snap.tick).toBe(5);
    expect(snap.deltas.totalWorkloads).toBe(0);
  });

  it('computes deltas against previous snapshot', () => {
    const first = payloadToEnvironmentSnapshot(samplePayload);
    const second = payloadToEnvironmentSnapshot(
      { ...samplePayload, totalWorkloads: 45, cpuPercent: 36.5, tick: 6 },
      first,
    );
    expect(second.deltas.totalWorkloads).toBe(3);
    expect(second.deltas.cpuPercent).toBeCloseTo(3);
    expect(second.tick).toBe(6);
  });
});

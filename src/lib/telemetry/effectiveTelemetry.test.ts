import { describe, expect, it } from 'vitest';
import { withTelemetryFallbacks } from './effectiveTelemetry';
import type { HudClusterModel } from '../hudClusterModel';

const model: HudClusterModel = {
  nodes: [
    { id: 'n1', name: 'node-01', cpu: 42, ram: 61, disk: 48, net: 35, power: 220, thermalC: 39, status: 'ok' },
    { id: 'n2', name: 'node-02', cpu: 38, ram: 55, disk: 44, net: 32, power: 210, thermalC: 38, status: 'ok' },
  ],
  eventLabel: 'steady state',
  activity: 0.4,
};

describe('withTelemetryFallbacks', () => {
  it('fills zero live metrics from HUD node aggregates', () => {
    const result = withTelemetryFallbacks(
      {
        totalWorkloads: 0,
        totalIops: 0,
        ingressMbps: 0,
        egressMbps: 0,
        cpuPercent: 0,
        ramPercent: 0,
        watts: 0,
        activeMigrations: 0,
        openCves: 0,
        trustScore: 85,
        tick: 1,
        deltas: {
          totalWorkloads: 0,
          totalIops: 0,
          ingressMbps: 0,
          egressMbps: 0,
          cpuPercent: 0,
          ramPercent: 0,
          watts: 0,
          activeMigrations: 0,
        },
      },
      model,
    );
    expect(result?.cpuPercent).toBe(40);
    expect(result?.ramPercent).toBe(58);
    expect(result?.watts).toBe(430);
    expect(result?.ingressMbps).toBeGreaterThan(0);
  });

  it('preserves non-zero live metrics', () => {
    const result = withTelemetryFallbacks(
      {
        totalWorkloads: 2,
        totalIops: 9000,
        ingressMbps: 120,
        egressMbps: 95,
        cpuPercent: 33,
        ramPercent: 44,
        watts: 880,
        activeMigrations: 0,
        openCves: 0,
        trustScore: 88,
        tick: 2,
        deltas: {
          totalWorkloads: 0,
          totalIops: 0,
          ingressMbps: 0,
          egressMbps: 0,
          cpuPercent: 0,
          ramPercent: 0,
          watts: 0,
          activeMigrations: 0,
        },
      },
      model,
    );
    expect(result?.cpuPercent).toBe(33);
    expect(result?.totalIops).toBe(9000);
  });
});

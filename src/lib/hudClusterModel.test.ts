import { describe, expect, it } from 'vitest';
import { buildHudClusterModel, fmtPct } from './hudClusterModel';
import { buildMachinesDashboard } from './dashboards';

describe('buildHudClusterModel', () => {
  it('derives node rows from fleet hosts', () => {
    const fleet = buildMachinesDashboard().fleet;
    const model = buildHudClusterModel(fleet, undefined);
    expect(model.nodes.length).toBeGreaterThan(0);
    expect(model.nodes[0].cpu).toBeGreaterThan(0);
    expect(fmtPct(model.nodes[0].cpu)).toMatch(/%$/);
  });

  it('computes thermal proxy from cpu', () => {
    const model = buildHudClusterModel([], {
      cpuPercent: 80,
      ramPercent: 70,
      watts: 1600,
      deltas: { cpuPercent: 2, ramPercent: 0, watts: 0, totalWorkloads: 0, totalIops: 0, ingressMbps: 0, egressMbps: 0, activeMigrations: 0 },
      tick: 1,
    } as never);
    expect(model.nodes[0].thermalC).toBeGreaterThan(32);
  });
});

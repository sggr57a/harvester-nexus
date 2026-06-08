import { describe, expect, it } from 'vitest';
import { buildClusterDashboardBundle } from './dashboardAdapters';
import type { DashboardTelemetryPayload } from './dashboardTypes';

const samplePayload: DashboardTelemetryPayload = {
  environment: {
    totalWorkloads: 2,
    totalIops: 50000,
    ingressMbps: 100,
    egressMbps: 90,
    cpuPercent: 40,
    ramPercent: 55,
    watts: 880,
    activeMigrations: 0,
    openCves: 0,
    trustScore: 88,
    tick: 3,
    source: 'mixed',
    clusterReady: true,
    monitoringEnabled: true,
    nodeCount: 2,
    podCount: 0,
    vmCount: 2,
  },
  storage: {
    pvcs: [
      {
        id: 'live-pvc-1',
        name: 'data-vol',
        namespace: 'default',
        storageClass: 'longhorn',
        sizeGiB: 10,
        status: 'bound',
        accessMode: 'RWO',
      },
    ],
    backends: [
      {
        id: 'longhorn',
        label: 'Longhorn',
        kind: 'block',
        usagePercent: 0,
        capacityTiB: 0,
        iops: 0,
        readMiBs: 0,
        writeMiBs: 0,
        driverHealth: 'healthy',
        csiTemplate: 'driver.longhorn.io',
        features: ['live'],
      },
    ],
    longhornVolumes: [],
  },
  machines: {
    fleet: [
      {
        id: 'vm-live-1',
        name: 'test-vm',
        kind: 'vm',
        host: 'node-1',
        cpuPercent: 0,
        ramGiB: 4,
        ramAllocGiB: 4,
        status: 'running',
        haEnabled: true,
        affinity: 'none',
      },
    ],
    migrations: [],
  },
  resourceMonitoring: {
    workItems: [],
    cpuSeries: [10, 20, 30, 40],
    ramSeries: [50, 52, 54, 55],
    memoryPressurePercent: 55,
  },
  xdr: {
    sensorsHealthy: 0,
    sensorsTotal: 0,
    deployed: false,
    events: [],
  },
  operations: {
    grafanaUrl: '/grafana',
    alertmanagerUrl: '/alertmanager',
    harvesterReadyZ: '/readyz',
    monitoringEnabled: true,
  },
};

describe('buildClusterDashboardBundle', () => {
  it('returns demo catalog when dataSource is demo', () => {
    const bundle = buildClusterDashboardBundle(null, 'demo');
    expect(bundle.dataSource).toBe('demo');
    expect(bundle.storage.pvcs.length).toBeGreaterThan(0);
    expect(bundle.machines.fleet.length).toBeGreaterThan(0);
  });

  it('uses only live cluster rows — never demo catalog fallbacks', () => {
    const bundle = buildClusterDashboardBundle(samplePayload, 'live');
    expect(bundle.dataSource).toBe('live');
    expect(bundle.storage.pvcs).toHaveLength(1);
    expect(bundle.storage.pvcs[0]?.name).toBe('data-vol');
    expect(bundle.storage.backends).toHaveLength(1);
    expect(bundle.machines.fleet).toHaveLength(1);
    expect(bundle.machines.affinityRules).toHaveLength(0);
    expect(bundle.resourceMonitoring.securityAudits).toHaveLength(0);
    expect(bundle.resourceMonitoring.resourceGraphs.map((g) => g.label)).toEqual(['CPU', 'RAM']);
  });

  it('returns empty live dashboards when payload missing in live mode', () => {
    const bundle = buildClusterDashboardBundle(null, 'live');
    expect(bundle.dataSource).toBe('live');
    expect(bundle.storage.backends).toHaveLength(0);
    expect(bundle.storage.pvcs).toHaveLength(0);
    expect(bundle.machines.fleet).toHaveLength(0);
    expect(bundle.resourceMonitoring.workItems).toHaveLength(0);
  });
});

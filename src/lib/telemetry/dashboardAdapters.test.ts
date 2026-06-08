import { describe, expect, it } from 'vitest';
import { buildClusterDashboardBundle } from './dashboardAdapters';
import type { DashboardTelemetryPayload } from './dashboardTypes';

const samplePayload: DashboardTelemetryPayload = {
  environment: {
    totalWorkloads: 10,
    totalIops: 50000,
    ingressMbps: 100,
    egressMbps: 90,
    cpuPercent: 40,
    ramPercent: 55,
    watts: 880,
    activeMigrations: 1,
    openCves: 2,
    trustScore: 88,
    tick: 3,
    source: 'mixed',
    clusterReady: true,
    monitoringEnabled: true,
    nodeCount: 2,
    podCount: 8,
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
    workItems: [
      {
        id: 'mig-live',
        kind: 'migration',
        label: 'Live migration process',
        target: 'vm-a / node-1 -> node-2',
        progress: 55,
        status: 'migrating',
      },
    ],
    cpuSeries: [10, 20, 30, 40],
    ramSeries: [50, 52, 54, 55],
    memoryPressurePercent: 85,
  },
  xdr: {
    sensorsHealthy: 2,
    sensorsTotal: 3,
    deployed: true,
    events: [{ message: 'FailedScheduling', namespace: 'default', name: 'ev-1' }],
  },
  operations: {
    grafanaUrl: '/grafana',
    alertmanagerUrl: '/alertmanager',
    harvesterReadyZ: '/readyz',
    monitoringEnabled: true,
  },
};

describe('buildClusterDashboardBundle', () => {
  it('returns static dashboards when no payload', () => {
    const bundle = buildClusterDashboardBundle(null);
    expect(bundle.live).toBe(false);
    expect(bundle.storage.pvcs.length).toBeGreaterThan(0);
    expect(bundle.machines.fleet.length).toBeGreaterThan(0);
  });

  it('merges live PVC and fleet rows when payload present', () => {
    const bundle = buildClusterDashboardBundle(samplePayload);
    expect(bundle.live).toBe(true);
    expect(bundle.storage.pvcs[0]?.name).toBe('data-vol');
    expect(bundle.machines.fleet.some((row) => row.name === 'test-vm')).toBe(true);
    expect(bundle.resourceMonitoring.workItems[0]?.id).toBe('mig-live');
    expect(bundle.resourceMonitoring.memoryPressure.visible).toBe(true);
    expect(bundle.operations?.grafanaUrl).toBe('/grafana');
    expect(bundle.xdr?.sensorsHealthy).toBe(2);
  });
});

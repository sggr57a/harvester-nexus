import { beforeEach, describe, expect, it } from 'vitest';
import { buildClusterDashboardBundle } from './dashboardAdapters';
import type { DashboardTelemetryPayload } from './dashboardTypes';
import { clearSimulationState, recordPolyComputeDeploy } from '../simulationStore';

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
  networking: {
    available: true,
    virtualSwitches: [],
    ovsPorts: [],
    ovsFlows: [],
    vlans: [],
    overlays: [],
    ingressRoutes: [],
    policyMatrix: [],
    tenants: [],
    nads: [],
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
  beforeEach(() => {
    clearSimulationState();
  });

  it('returns demo catalog when dataSource is demo', () => {
    const bundle = buildClusterDashboardBundle(null, 'demo');
    expect(bundle.dataSource).toBe('demo');
    expect(bundle.storage.pvcs.length).toBeGreaterThan(0);
    expect(bundle.machines.fleet.length).toBeGreaterThan(0);
  });

  it('merges live cluster rows with infrastructure nodes', () => {
    const bundle = buildClusterDashboardBundle(samplePayload, 'live');
    expect(bundle.dataSource).toBe('live');
    expect(bundle.storage.pvcs).toHaveLength(1);
    expect(bundle.machines.fleet.some((row) => row.kind === 'node')).toBe(true);
    expect(bundle.machines.fleet.some((row) => row.name === 'test-vm')).toBe(true);
    expect(bundle.resourceMonitoring.resourceGraphs.map((g) => g.label)).toEqual(['CPU', 'RAM']);
  });

  it('synthesizes infrastructure rows when live fleet is empty but nodes exist', () => {
    const sparse: DashboardTelemetryPayload = {
      ...samplePayload,
      machines: { fleet: [], migrations: [] },
      environment: { ...samplePayload.environment, nodeCount: 3, cpuPercent: 30, ramPercent: 50 },
    };
    const bundle = buildClusterDashboardBundle(sparse, 'live');
    expect(bundle.machines.fleet.filter((row) => row.kind === 'node')).toHaveLength(3);
  });

  it('uses live networking inventory without demo catalog merge', () => {
    const bundle = buildClusterDashboardBundle(samplePayload, 'live');
    expect(bundle.networking.vlans).toEqual([]);
    expect(bundle.networking.topology.nodes).toEqual([]);
    expect(bundle.networking.nads).toEqual([]);
    expect(bundle.networking.diagnostics?.length).toBeGreaterThan(0);
  });

  it('does not merge simulated workloads into live mode', () => {
    recordPolyComputeDeploy({
      kind: 'kubevirt-vm',
      name: 'edge-vm',
      namespace: 'tenant-apps',
      cpuCores: 2,
      memoryGiB: 4,
      image: 'kubevirt/cirros-container-disk-demo:latest',
      enableHa: true,
      hostAffinity: 'any',
    });
    const bundle = buildClusterDashboardBundle(null, 'live');
    expect(bundle.machines.fleet.some((row) => row.name === 'edge-vm')).toBe(false);
    expect(bundle.resourceMonitoring.workItems.length).toBe(0);
  });
});

import {
  buildMachinesDashboard,
  buildStorageDashboard,
  type MachineRow,
  type MachinesDashboard,
  type StorageDashboard,
} from '../dashboards';
import { buildResourceMonitoring, type ResourceMonitoring } from '../activeOperations';
import {
  simulationToFleet,
  simulationToWorkItems,
} from '../simulationStore';
import type {
  DashboardTelemetryPayload,
  LiveMachinesSlice,
  LiveResourceMonitoringSlice,
  LiveStorageSlice,
} from './dashboardTypes';

export type TelemetryDataSource = 'demo' | 'live';

export interface ClusterDashboardBundle {
  dataSource: TelemetryDataSource;
  storage: StorageDashboard;
  machines: MachinesDashboard;
  resourceMonitoring: ResourceMonitoring;
  xdr?: DashboardTelemetryPayload['xdr'];
  operations?: DashboardTelemetryPayload['operations'];
}

const EMPTY_STORAGE: StorageDashboard = {
  id: 'storage',
  title: 'Storage Fabric',
  backends: [],
  pvcs: [],
  snapshots: [],
  replicationLinks: [],
};

const EMPTY_MACHINES: MachinesDashboard = {
  id: 'machines',
  title: 'Machines & Containers',
  fleet: [],
  migrations: [],
  affinityRules: [],
  ha: [],
  consoleChips: [],
};

function mergeFleetRows(...groups: MachineRow[][]): MachineRow[] {
  const byId = new Map<string, MachineRow>();
  for (const group of groups) {
    for (const row of group) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function infrastructureRowsFromPayload(payload: DashboardTelemetryPayload | null | undefined): MachineRow[] {
  if (!payload?.environment?.nodeCount || payload.environment.nodeCount <= 0) {
    return [];
  }
  const infra = payload.machines.fleet.filter((row) => row.kind === 'node');
  if (infra.length > 0) return infra;

  const nodeCount = payload.environment.nodeCount;
  const cpu = payload.environment.cpuPercent || 0;
  const ram = payload.environment.ramPercent || 0;
  const perNodeCpu = nodeCount > 0 ? cpu / nodeCount : cpu;
  const perNodeRamGiB = nodeCount > 0 ? Math.max(8, (ram / 100) * 64) : 32;

  return Array.from({ length: nodeCount }, (_, index) => {
    const host = `node-${String(index + 1).padStart(2, '0')}`;
    return {
      id: `infra-${host}`,
      name: host,
      kind: 'node' as const,
      host,
      cpuPercent: Math.round(perNodeCpu * 10) / 10,
      ramGiB: Math.round(perNodeRamGiB * 10) / 10,
      ramAllocGiB: 64,
      status: 'running' as const,
      haEnabled: index === 0,
      affinity: 'none' as const,
    };
  });
}

function buildLiveStorage(live: LiveStorageSlice): StorageDashboard {
  return {
    ...EMPTY_STORAGE,
    backends: live.backends,
    pvcs: live.pvcs,
  };
}

function buildLiveMachines(live: LiveMachinesSlice): MachinesDashboard {
  return {
    ...EMPTY_MACHINES,
    fleet: live.fleet,
    migrations: live.migrations,
  };
}

function buildLiveResourceMonitoring(live: LiveResourceMonitoringSlice): ResourceMonitoring {
  const memoryPressurePercent = live.memoryPressurePercent;
  const graphs: ResourceMonitoring['resourceGraphs'] = [];
  if (live.cpuSeries.length > 0) {
    graphs.push({ label: 'CPU', unit: '%', samples: live.cpuSeries });
  }
  if (live.ramSeries.length > 0) {
    graphs.push({ label: 'RAM', unit: '%', samples: live.ramSeries });
  }

  const migrationProcesses = live.workItems
    .filter((item) => item.kind === 'migration')
    .map((item, index) => ({
      id: item.id || `live-mig-${index}`,
      workloadType: 'VirtualMachine' as const,
      sourceNode: item.target.split('->')[0]?.trim() ?? '?',
      targetNode: item.target.split('->')[1]?.trim() ?? '?',
      processModel: 'vMotion-style live migration' as const,
      memoryStatePreserved: true,
      requiresShutdown: false,
      progress: item.progress,
    }));

  return {
    pageTitle: 'Resource Monitoring',
    menuItems: [
      { id: 'workloads', label: 'Workloads', signal: 'POD_IO' },
      { id: 'kubernetes', label: 'Kubernetes', signal: 'K8S_PV' },
      { id: 'storage', label: 'Storage', signal: 'CSI_AL' },
      { id: 'compute', label: 'Compute', signal: 'CPU_RAM' },
      { id: 'security', label: 'Security', signal: 'AUDIT' },
    ],
    workItems: live.workItems,
    monitoredResourceClasses: ['pods', 'virtual-machines', 'persistent-volumes', 'cpu', 'ram', 'nodes'],
    resourceGraphs: graphs,
    memoryPressure: {
      visible: memoryPressurePercent >= 80,
      severity: memoryPressurePercent >= 92 ? 'critical' : memoryPressurePercent >= 80 ? 'warning' : 'normal',
      node: 'cluster',
      pressurePercent: memoryPressurePercent,
    },
    migrationProcesses,
    securityAudits: [],
    summary: {
      activeWorkCount: live.workItems.length,
      highestSecurityScore: 0,
      monitoredButHiddenCount: 0,
      blackGlassPanels: true,
      animationStyle: 'drawn-hud',
    },
  };
}

const EMPTY_RESOURCE: ResourceMonitoring = buildLiveResourceMonitoring({
  workItems: [],
  cpuSeries: [],
  ramSeries: [],
  memoryPressurePercent: 0,
});

function mergeResourceMonitoring(
  base: ResourceMonitoring,
  payload: DashboardTelemetryPayload | null | undefined,
  includeSimulation: boolean,
): ResourceMonitoring {
  const simItems = includeSimulation ? simulationToWorkItems() : [];
  const mergedItems = [...base.workItems];
  for (const item of simItems) {
    if (!mergedItems.some((existing) => existing.id === item.id)) {
      mergedItems.push(item);
    }
  }

  const cpuSeries =
    base.resourceGraphs.find((graph) => graph.label === 'CPU')?.samples ??
    (payload?.resourceMonitoring.cpuSeries.length
      ? payload.resourceMonitoring.cpuSeries
      : payload?.environment.cpuPercent
        ? [payload.environment.cpuPercent]
        : []);
  const ramSeries =
    base.resourceGraphs.find((graph) => graph.label === 'RAM')?.samples ??
    (payload?.resourceMonitoring.ramSeries.length
      ? payload.resourceMonitoring.ramSeries
      : payload?.environment.ramPercent
        ? [payload.environment.ramPercent]
        : []);

  const graphs: ResourceMonitoring['resourceGraphs'] = [];
  if (cpuSeries.length > 0) graphs.push({ label: 'CPU', unit: '%', samples: cpuSeries });
  if (ramSeries.length > 0) graphs.push({ label: 'RAM', unit: '%', samples: ramSeries });

  const memoryPressurePercent =
    payload?.resourceMonitoring.memoryPressurePercent ?? base.memoryPressure.pressurePercent;

  return {
    ...base,
    workItems: mergedItems,
    resourceGraphs: graphs,
    memoryPressure: {
      ...base.memoryPressure,
      visible: memoryPressurePercent >= 80,
      severity: memoryPressurePercent >= 92 ? 'critical' : memoryPressurePercent >= 80 ? 'warning' : 'normal',
      pressurePercent: memoryPressurePercent,
    },
    summary: {
      ...base.summary,
      activeWorkCount: mergedItems.length,
    },
  };
}


export function buildClusterDashboardBundle(
  payload: DashboardTelemetryPayload | null | undefined,
  dataSource: TelemetryDataSource,
): ClusterDashboardBundle {
  if (dataSource === 'demo') {
    const demoMachines = buildMachinesDashboard();
    const demoFleet = mergeFleetRows(demoMachines.fleet, simulationToFleet());
    const demoResource = buildResourceMonitoring();
    const mergedResource = mergeResourceMonitoring(
      {
        ...demoResource,
        workItems: [...demoResource.workItems, ...simulationToWorkItems()],
        summary: {
          ...demoResource.summary,
          activeWorkCount: demoResource.workItems.length + simulationToWorkItems().length,
        },
      },
      payload,
      true,
    );

    return {
      dataSource: 'demo',
      storage: buildStorageDashboard(),
      machines: { ...demoMachines, fleet: demoFleet },
      resourceMonitoring: mergedResource,
      xdr: undefined,
      operations: undefined,
    };
  }

  const live = payload ?? {
    storage: { pvcs: [], backends: [], longhornVolumes: [] },
    machines: { fleet: [], migrations: [] },
    resourceMonitoring: {
      workItems: [],
      cpuSeries: [],
      ramSeries: [],
      memoryPressurePercent: 0,
    },
  };

  const base: ClusterDashboardBundle = {
    dataSource: 'live',
    storage: buildLiveStorage(live.storage),
    machines: buildLiveMachines(live.machines),
    resourceMonitoring: buildLiveResourceMonitoring(live.resourceMonitoring),
    xdr: payload?.xdr,
    operations: payload?.operations,
  };

  const infraRows = infrastructureRowsFromPayload(payload);
  if (infraRows.length > 0 && base.machines.fleet.every((row) => row.kind !== 'node')) {
    return {
      ...base,
      machines: {
        ...base.machines,
        fleet: mergeFleetRows(base.machines.fleet, infraRows),
      },
    };
  }

  return base;
}

export { EMPTY_STORAGE, EMPTY_MACHINES, EMPTY_RESOURCE };

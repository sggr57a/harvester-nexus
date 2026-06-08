import {
  buildMachinesDashboard,
  buildStorageDashboard,
  type MachinesDashboard,
  type StorageDashboard,
} from '../dashboards';
import { buildResourceMonitoring, type ResourceMonitoring } from '../activeOperations';
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
    monitoredResourceClasses: ['pods', 'virtual-machines', 'persistent-volumes', 'cpu', 'ram'],
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

export function buildClusterDashboardBundle(
  payload: DashboardTelemetryPayload | null | undefined,
  dataSource: TelemetryDataSource,
): ClusterDashboardBundle {
  if (dataSource === 'demo') {
    return {
      dataSource: 'demo',
      storage: buildStorageDashboard(),
      machines: buildMachinesDashboard(),
      resourceMonitoring: buildResourceMonitoring(),
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

  return {
    dataSource: 'live',
    storage: buildLiveStorage(live.storage),
    machines: buildLiveMachines(live.machines),
    resourceMonitoring: buildLiveResourceMonitoring(live.resourceMonitoring),
    xdr: payload?.xdr,
    operations: payload?.operations,
  };
}

export { EMPTY_STORAGE, EMPTY_MACHINES, EMPTY_RESOURCE };

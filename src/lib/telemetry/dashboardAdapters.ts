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

function mergeStorage(staticDash: StorageDashboard, live?: LiveStorageSlice): StorageDashboard {
  if (!live || (live.pvcs.length === 0 && live.backends.length === 0)) {
    return staticDash;
  }
  const backendById = new Map(staticDash.backends.map((b) => [b.id, b]));
  const mergedBackends =
    live.backends.length > 0
      ? live.backends.map((liveBackend) => {
          const demo = backendById.get(liveBackend.id);
          return demo ? { ...demo, ...liveBackend, features: demo.features } : liveBackend;
        })
      : staticDash.backends;
  return {
    ...staticDash,
    backends: mergedBackends,
    pvcs: live.pvcs.length > 0 ? live.pvcs : staticDash.pvcs,
  };
}

function mergeMachines(staticDash: MachinesDashboard, live?: LiveMachinesSlice): MachinesDashboard {
  if (!live || (live.fleet.length === 0 && live.migrations.length === 0)) {
    return staticDash;
  }
  return {
    ...staticDash,
    fleet: live.fleet.length > 0 ? live.fleet : staticDash.fleet,
    migrations: live.migrations.length > 0 ? live.migrations : staticDash.migrations,
  };
}

function mergeResourceMonitoring(
  staticOps: ResourceMonitoring,
  live?: LiveResourceMonitoringSlice,
): ResourceMonitoring {
  if (!live) return staticOps;
  const memoryPressurePercent = live.memoryPressurePercent;
  const workItems = live.workItems.length > 0 ? live.workItems : staticOps.workItems;
  const resourceGraphs = staticOps.resourceGraphs.map((graph) => {
    if (graph.label === 'CPU' && live.cpuSeries.length > 0) {
      return { ...graph, samples: live.cpuSeries };
    }
    if (graph.label === 'RAM' && live.ramSeries.length > 0) {
      return { ...graph, samples: live.ramSeries };
    }
    return graph;
  });
  const migrationProcesses =
    live.workItems.filter((item) => item.kind === 'migration').length > 0
      ? live.workItems
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
          }))
      : staticOps.migrationProcesses;

  return {
    ...staticOps,
    workItems,
    resourceGraphs,
    migrationProcesses,
    memoryPressure: {
      visible: memoryPressurePercent >= 80,
      severity: memoryPressurePercent >= 92 ? 'critical' : memoryPressurePercent >= 80 ? 'warning' : 'normal',
      node: 'cluster',
      pressurePercent: memoryPressurePercent,
    },
    summary: {
      ...staticOps.summary,
      activeWorkCount: workItems.length,
    },
  };
}

export function buildClusterDashboardBundle(payload?: DashboardTelemetryPayload | null) {
  const staticStorage = buildStorageDashboard();
  const staticMachines = buildMachinesDashboard();
  const staticResource = buildResourceMonitoring();

  if (!payload) {
    return {
      storage: staticStorage,
      machines: staticMachines,
      resourceMonitoring: staticResource,
      xdr: undefined,
      operations: undefined,
      live: false,
    };
  }

  return {
    storage: mergeStorage(staticStorage, payload.storage),
    machines: mergeMachines(staticMachines, payload.machines),
    resourceMonitoring: mergeResourceMonitoring(staticResource, payload.resourceMonitoring),
    xdr: payload.xdr,
    operations: payload.operations,
    live: true,
  };
}

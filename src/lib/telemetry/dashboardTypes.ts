import type { PvcRow, StorageBackendCard } from '../dashboards';
import type { MachineRow, MigrationArc } from '../dashboards';
import type { ActiveWorkItem } from '../activeOperations';
import type { EnvironmentTelemetryPayload } from './types';

export interface LiveStorageSlice {
  pvcs: PvcRow[];
  backends: StorageBackendCard[];
  longhornVolumes: { name: string; health: string; size: number }[];
}

export interface LiveMachinesSlice {
  fleet: MachineRow[];
  migrations: MigrationArc[];
}

export interface LiveResourceMonitoringSlice {
  workItems: ActiveWorkItem[];
  cpuSeries: number[];
  ramSeries: number[];
  memoryPressurePercent: number;
}

export interface LiveXdrSlice {
  sensorsHealthy: number;
  sensorsTotal: number;
  deployed: boolean;
  events: { message: string; namespace: string; name: string }[];
}

export interface LiveOperationsSlice {
  grafanaUrl: string;
  alertmanagerUrl: string;
  harvesterReadyZ: string;
  monitoringEnabled: boolean;
}

export interface DashboardTelemetryPayload {
  environment: EnvironmentTelemetryPayload;
  storage: LiveStorageSlice;
  machines: LiveMachinesSlice;
  resourceMonitoring: LiveResourceMonitoringSlice;
  xdr: LiveXdrSlice;
  operations: LiveOperationsSlice;
}

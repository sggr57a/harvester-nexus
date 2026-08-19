import type { PvcRow, StorageBackendCard } from '../dashboards';
import type { MachineRow, MigrationArc } from '../dashboards';
import type { ActiveWorkItem } from '../activeOperations';
import type { EnvironmentTelemetryPayload } from './types';
import type {
  IngressRoute,
  NetworkDiagnosticRow,
  NetworkPolicyCell,
  NetworkTenantRow,
  OvsBridgeRow,
  OvsFlowRow,
  OvsPortRow,
  PortGroupRow,
  SdnZoneRow,
  VirtualBridgeRow,
  VlanLane,
} from '../dashboards';

export interface LiveNetworkingSlice {
  available: boolean;
  ovsAvailable?: boolean;
  virtualSwitches: OvsBridgeRow[];
  ovsPorts: OvsPortRow[];
  ovsFlows: OvsFlowRow[];
  virtualBridges?: VirtualBridgeRow[];
  portGroups?: PortGroupRow[];
  sdnZones?: SdnZoneRow[];
  vlans: VlanLane[];
  overlays: { id: string; name: string; protocol: string; vni: number; tenant: string }[];
  ingressRoutes: IngressRoute[];
  policyMatrix: NetworkPolicyCell[];
  tenants: NetworkTenantRow[];
  diagnostics?: NetworkDiagnosticRow[];
  nads?: { id: string; name: string; namespace: string; nadRef: string; ovsBridge?: string; vlanId?: number }[];
}

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
  networking?: LiveNetworkingSlice;
}

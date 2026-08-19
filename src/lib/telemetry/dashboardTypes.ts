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

export interface LiveXdrEvent {
  id?: string;
  source?: string;
  endpointId?: string;
  kind?: string;
  timestampMs?: number;
  payload?: Record<string, string | number | boolean | string[]>;
  process?: string;
  remoteIp?: string;
  remoteHost?: string;
  hash?: string;
  sensorSeverity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  namespace?: string;
  name?: string;
}

export interface LiveXdrSensorHealth {
  healthy: number;
  total: number;
  ingesting?: boolean;
}

export interface LiveXdrSlice {
  sensorsHealthy: number;
  sensorsTotal: number;
  deployed: boolean;
  events: LiveXdrEvent[];
  bySensor?: Record<string, LiveXdrSensorHealth>;
}

export interface LiveOperationsSlice {
  grafanaUrl: string;
  alertmanagerUrl: string;
  harvesterReadyZ: string;
  monitoringEnabled: boolean;
}

export interface LiveMemoryTier {
  id: 'dram' | 'hbm' | 'cxl' | 'nvme' | 'phase-change' | 'zswap' | 'swap';
  label: string;
  capacityGiB: number;
  usedGiB: number;
  latencyNs: number | null;
  throughputGiBs: number | null;
  present?: boolean;
}

export interface LiveProcessorMemorySlice {
  available?: boolean;
  id?: 'processor-memory';
  title?: string;
  policy?: string;
  enabled?: boolean;
  numaZones?: { id: string; hasCpu?: boolean; localRamGiB: number; remoteHitsPct: number | null; cores: { id: number; utilizationPercent: number; frequencyGhz: number; thread: 'p' | 'e' }[] }[];
  memoryTiers?: LiveMemoryTier[];
  pressureWaterfall?: { label: string; cpuPressure: number | null; memoryPressure: number | null; ioPressure: number | null }[];
  swapDevices?: { device: string; sizeGiB: number; usedGiB: number; priority: number | null }[];
  hugepages?: { sizeMiB: number | null; allocated: number | null; free: number | null }[];
  vmstat?: Record<string, number | null>;
  zswap?: {
    enabled: boolean | null;
    compressor: string | null;
    maxPoolPercent: number | null;
    storedPages: number | null;
    poolLimitHit: number | null;
    writtenBackPages: number | null;
  };
  meminfo?: Record<string, number | null>;
  demotionEnabled?: boolean | null;
  numaBalancing?: number | null;
  waitingForHardware?: string[];
  capabilities?: Record<string, boolean>;
  notes?: string[];
  error?: string;
}

export interface DashboardTelemetryPayload {
  environment: EnvironmentTelemetryPayload;
  storage: LiveStorageSlice;
  machines: LiveMachinesSlice;
  resourceMonitoring: LiveResourceMonitoringSlice;
  xdr: LiveXdrSlice;
  operations: LiveOperationsSlice;
  networking?: LiveNetworkingSlice;
  processorMemory?: LiveProcessorMemorySlice;
}

/** Harvester HCI resource types — mirrors harvester-ui-extension/pkg/harvester/types.ts */

export const HCI = {
  VM: 'kubevirt.io.virtualmachine',
  VMI: 'kubevirt.io.virtualmachineinstance',
  VMIM: 'kubevirt.io.virtualmachineinstancemigration',
  VM_TEMPLATE: 'harvesterhci.io.virtualmachinetemplate',
  VM_VERSION: 'harvesterhci.io.virtualmachinetemplateversion',
  IMAGE: 'harvesterhci.io.virtualmachineimage',
  SSH: 'harvesterhci.io.keypair',
  VOLUME: 'harvesterhci.io.volume',
  SETTING: 'harvesterhci.io.setting',
  SCHEDULE_VM_BACKUP: 'harvesterhci.io.schedulevmbackup',
  BACKUP: 'harvesterhci.io.virtualmachinebackup',
  CLUSTER_NETWORK: 'network.harvesterhci.io.clusternetwork',
  NETWORK_ATTACHMENT: 'harvesterhci.io.networkattachmentdefinition',
  VPC: 'kubeovn.io.vpc',
  NETWORK_POLICY: 'networking.k8s.io.networkpolicy',
  SNAPSHOT: 'harvesterhci.io.volumesnapshot',
  VM_SNAPSHOT: 'harvesterhci.io.vmsnapshot',
  ALERTMANAGERCONFIG: 'harvesterhci.io.monitoring.alertmanagerconfig',
  CLUSTER_FLOW: 'harvesterhci.io.logging.clusterflow',
  CLUSTER_OUTPUT: 'harvesterhci.io.logging.clusteroutput',
  FLOW: 'harvesterhci.io.logging.flow',
  OUTPUT: 'harvesterhci.io.logging.output',
  STORAGE: 'harvesterhci.io.storage',
  CLOUD_TEMPLATE: 'harvesterhci.io.cloudtemplate',
  SECRET: 'harvesterhci.io.secret',
  HOST: 'harvesterhci.io.host',
  DASHBOARD: 'harvesterhci.io.dashboard',
  NAMESPACE: 'namespace',
  LB: 'loadbalancer.harvesterhci.io.loadbalancer',
  IP_POOL: 'loadbalancer.harvesterhci.io.ippool',
  PCI_DEVICE: 'devices.harvesterhci.io.pcidevice',
  SR_IOV: 'devices.harvesterhci.io.sriovnetworkdevice',
  VGPU_DEVICE: 'devices.harvesterhci.io.vgpudevice',
  SR_IOVGPU_DEVICE: 'devices.harvesterhci.io.sriovgpudevice',
  USB_DEVICE: 'devices.harvesterhci.io.usbdevice',
  MIG_CONFIGURATION: 'devices.harvesterhci.io.migconfiguration',
  ADD_ONS: 'harvesterhci.io.addon',
} as const;

export type HarvesterResourceType = (typeof HCI)[keyof typeof HCI] | typeof HCI.NETWORK_POLICY;

export type HarvesterResourceState =
  | 'running'
  | 'stopped'
  | 'pending'
  | 'error'
  | 'migrating'
  | 'paused'
  | 'ready'
  | 'degraded'
  | 'unknown';

export interface HarvesterResourceRow {
  id: string;
  name: string;
  namespace?: string;
  type: HarvesterResourceType;
  state: HarvesterResourceState;
  description?: string;
  age: string;
  cpu?: string;
  memory?: string;
  node?: string;
  storageClass?: string;
  size?: string;
  extra?: Record<string, string>;
}

export interface HarvesterResourceListPayload {
  type: HarvesterResourceType;
  dataSource: 'demo' | 'live';
  rows: HarvesterResourceRow[];
  total: number;
  clusterVersion?: string;
}

export interface HarvesterDashboardPayload {
  dataSource: 'demo' | 'live';
  clusterVersion: string;
  nodeCount: number;
  vmCount: number;
  volumeCount: number;
  imageCount: number;
  cpuPercent: number;
  ramPercent: number;
  storageUsedTiB: number;
  storageTotalTiB: number;
  recentEvents: { time: string; level: 'info' | 'warn' | 'error'; message: string }[];
}

export interface HarvesterVmAction {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  bulkable?: boolean;
  danger?: boolean;
}

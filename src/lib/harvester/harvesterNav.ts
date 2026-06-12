import { HCI, type HarvesterResourceType } from './harvesterTypes';

export interface HarvesterNavItem {
  id: HarvesterResourceType;
  label: string;
  sig: string;
  group: HarvesterNavGroup;
  weight: number;
  creatable?: boolean;
}

export type HarvesterNavGroup =
  | 'ROOT'
  | 'NETWORKS'
  | 'BACKUP'
  | 'MONITORING'
  | 'ADVANCED';

export const HARVESTER_NAV_GROUPS: HarvesterNavGroup[] = [
  'ROOT',
  'NETWORKS',
  'BACKUP',
  'MONITORING',
  'ADVANCED',
];

/** Navigation catalog aligned with harvester-ui-extension/pkg/harvester/config/harvester-cluster.js */
export const HARVESTER_NAV_ITEMS: HarvesterNavItem[] = [
  { id: HCI.DASHBOARD, label: 'Dashboard', sig: 'HV_DASH', group: 'ROOT', weight: 500 },
  { id: HCI.HOST, label: 'Hosts', sig: 'HV_HOST', group: 'ROOT', weight: 499 },
  { id: HCI.VM, label: 'Virtual Machines', sig: 'HV_VM', group: 'ROOT', weight: 498, creatable: true },
  { id: HCI.VOLUME, label: 'Volumes', sig: 'HV_VOL', group: 'ROOT', weight: 497, creatable: true },
  { id: HCI.IMAGE, label: 'Images', sig: 'HV_IMG', group: 'ROOT', weight: 496, creatable: true },
  { id: HCI.NAMESPACE, label: 'Namespaces', sig: 'HV_NS', group: 'ROOT', weight: 495, creatable: true },
  { id: HCI.STORAGE, label: 'Storage Classes', sig: 'HV_SC', group: 'ROOT', weight: 494 },

  { id: HCI.CLUSTER_NETWORK, label: 'Cluster Networks', sig: 'HV_CN', group: 'NETWORKS', weight: 189 },
  { id: HCI.NETWORK_ATTACHMENT, label: 'Networks', sig: 'HV_NET', group: 'NETWORKS', weight: 188, creatable: true },
  { id: HCI.VPC, label: 'VPCs', sig: 'HV_VPC', group: 'NETWORKS', weight: 187, creatable: true },
  { id: HCI.NETWORK_POLICY, label: 'Network Policies', sig: 'HV_NP', group: 'NETWORKS', weight: 186, creatable: true },
  { id: HCI.LB, label: 'Load Balancers', sig: 'HV_LB', group: 'NETWORKS', weight: 185, creatable: true },
  { id: HCI.IP_POOL, label: 'IP Pools', sig: 'HV_IP', group: 'NETWORKS', weight: 184, creatable: true },

  { id: HCI.SCHEDULE_VM_BACKUP, label: 'Schedules', sig: 'HV_SCH', group: 'BACKUP', weight: 201, creatable: true },
  { id: HCI.BACKUP, label: 'Backups', sig: 'HV_BAK', group: 'BACKUP', weight: 200 },
  { id: HCI.SNAPSHOT, label: 'Volume Snapshots', sig: 'HV_SNAP', group: 'BACKUP', weight: 190 },
  { id: HCI.VM_SNAPSHOT, label: 'VM Snapshots', sig: 'HV_VSN', group: 'BACKUP', weight: 191 },

  { id: HCI.ALERTMANAGERCONFIG, label: 'Alertmanager Configs', sig: 'HV_AM', group: 'MONITORING', weight: 87, creatable: true },
  { id: HCI.CLUSTER_FLOW, label: 'Cluster Flows', sig: 'HV_CF', group: 'MONITORING', weight: 79, creatable: true },
  { id: HCI.CLUSTER_OUTPUT, label: 'Cluster Outputs', sig: 'HV_CO', group: 'MONITORING', weight: 78, creatable: true },
  { id: HCI.FLOW, label: 'Flows', sig: 'HV_FL', group: 'MONITORING', weight: 77, creatable: true },
  { id: HCI.OUTPUT, label: 'Outputs', sig: 'HV_OUT', group: 'MONITORING', weight: 76, creatable: true },

  { id: HCI.VM_VERSION, label: 'VM Templates', sig: 'HV_TPL', group: 'ADVANCED', weight: 289, creatable: true },
  { id: HCI.SSH, label: 'SSH Keys', sig: 'HV_SSH', group: 'ADVANCED', weight: 170, creatable: true },
  { id: HCI.CLOUD_TEMPLATE, label: 'Cloud Templates', sig: 'HV_CT', group: 'ADVANCED', weight: 87, creatable: true },
  { id: HCI.PCI_DEVICE, label: 'PCI Devices', sig: 'HV_PCI', group: 'ADVANCED', weight: 14 },
  { id: HCI.SR_IOV, label: 'SR-IOV Networks', sig: 'HV_SIO', group: 'ADVANCED', weight: 15 },
  { id: HCI.VGPU_DEVICE, label: 'vGPU Devices', sig: 'HV_VGP', group: 'ADVANCED', weight: 12 },
  { id: HCI.SR_IOVGPU_DEVICE, label: 'SR-IOV GPU', sig: 'HV_SGP', group: 'ADVANCED', weight: 13 },
  { id: HCI.USB_DEVICE, label: 'USB Devices', sig: 'HV_USB', group: 'ADVANCED', weight: 11 },
  { id: HCI.MIG_CONFIGURATION, label: 'MIG Configuration', sig: 'HV_MIG', group: 'ADVANCED', weight: 12 },
  { id: HCI.ADD_ONS, label: 'Add-ons', sig: 'HV_ADD', group: 'ADVANCED', weight: -900 },
  { id: HCI.SECRET, label: 'Secrets', sig: 'HV_SEC', group: 'ADVANCED', weight: -999, creatable: true },
  { id: HCI.SETTING, label: 'Settings', sig: 'HV_SET', group: 'ADVANCED', weight: -1000 },
];

export function findHarvesterNavItem(id: HarvesterResourceType): HarvesterNavItem | undefined {
  return HARVESTER_NAV_ITEMS.find((item) => item.id === id);
}

export const HARVESTER_GROUP_LABELS: Record<HarvesterNavGroup, string> = {
  ROOT: 'HARVESTER',
  NETWORKS: 'NETWORKS',
  BACKUP: 'BACKUP & SNAPSHOT',
  MONITORING: 'MONITORING & LOGGING',
  ADVANCED: 'ADVANCED',
};

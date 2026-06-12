import { buildMachinesDashboard, buildStorageDashboard } from '../dashboards';
import { HCI, type HarvesterDashboardPayload, type HarvesterResourceListPayload, type HarvesterResourceRow, type HarvesterResourceType } from './harvesterTypes';

function ageFromMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function vmRows(): HarvesterResourceRow[] {
  const machines = buildMachinesDashboard();
  return machines.fleet
    .filter((row) => row.kind === 'vm')
    .map((row, index) => ({
      id: row.id,
      name: row.name,
      namespace: row.namespace ?? 'default',
      type: HCI.VM,
      state: row.status === 'running' ? 'running' : row.status === 'migrating' ? 'migrating' : row.status === 'paused' ? 'paused' : 'pending',
      age: ageFromMinutes(30 + index * 47),
      cpu: `${row.cpuPercent.toFixed(0)}%`,
      memory: `${row.ramGiB} GiB`,
      node: row.host,
      extra: { ip: row.networks?.[0]?.ip ?? '—', profile: row.guestProfile ?? 'linux' },
    }));
}

function hostRows(): HarvesterResourceRow[] {
  return [
    { id: 'host-01', name: 'control-plane', type: HCI.HOST, state: 'ready', age: '90d', cpu: '12 cores', memory: '64 GiB', node: 'control-plane', extra: { role: 'management' } },
    { id: 'host-02', name: 'compute-01', type: HCI.HOST, state: 'ready', age: '60d', cpu: '32 cores', memory: '256 GiB', node: 'compute-01', extra: { role: 'worker' } },
    { id: 'host-03', name: 'compute-02', type: HCI.HOST, state: 'ready', age: '60d', cpu: '32 cores', memory: '256 GiB', node: 'compute-02', extra: { role: 'worker' } },
    { id: 'host-04', name: 'compute-03', type: HCI.HOST, state: 'degraded', age: '60d', cpu: '32 cores', memory: '256 GiB', node: 'compute-03', extra: { role: 'worker' } },
    { id: 'host-05', name: 'edge-a', type: HCI.HOST, state: 'ready', age: '45d', cpu: '16 cores', memory: '128 GiB', node: 'edge-a', extra: { role: 'edge' } },
  ];
}

function volumeRows(): HarvesterResourceRow[] {
  const storage = buildStorageDashboard();
  return storage.pvcs.map((pvc, index) => ({
    id: pvc.id,
    name: pvc.name,
    namespace: pvc.namespace,
    type: HCI.VOLUME,
    state: pvc.status === 'bound' ? 'ready' : pvc.status === 'pending' ? 'pending' : 'unknown',
    age: ageFromMinutes(15 + index * 22),
    storageClass: pvc.storageClass,
    size: `${pvc.sizeGiB} GiB`,
    extra: { accessMode: pvc.accessMode },
  }));
}

function imageRows(): HarvesterResourceRow[] {
  return [
    { id: 'img-ubuntu', name: 'ubuntu-22.04', namespace: 'default', type: HCI.IMAGE, state: 'ready', age: '14d', size: '2.4 GiB', description: 'Ubuntu 22.04 LTS cloud image' },
    { id: 'img-sle', name: 'sle-micro-6.0', namespace: 'default', type: HCI.IMAGE, state: 'ready', age: '21d', size: '1.8 GiB', description: 'SLE Micro base image' },
    { id: 'img-win', name: 'windows-server-2022', namespace: 'default', type: HCI.IMAGE, state: 'pending', age: '2h', size: '8.1 GiB', description: 'Windows Server 2022 (downloading)' },
    { id: 'img-centos', name: 'centos-stream-9', namespace: 'default', type: HCI.IMAGE, state: 'ready', age: '7d', size: '1.2 GiB', description: 'CentOS Stream 9' },
  ];
}

function namespaceRows(): HarvesterResourceRow[] {
  return [
    { id: 'ns-default', name: 'default', type: HCI.NAMESPACE, state: 'ready', age: '90d' },
    { id: 'ns-kubevirt', name: 'kubevirt', type: HCI.NAMESPACE, state: 'ready', age: '90d' },
    { id: 'ns-longhorn', name: 'longhorn-system', type: HCI.NAMESPACE, state: 'ready', age: '90d' },
    { id: 'ns-cattle', name: 'cattle-system', type: HCI.NAMESPACE, state: 'ready', age: '90d' },
    { id: 'ns-demo', name: 'demo-workloads', type: HCI.NAMESPACE, state: 'ready', age: '12d', description: 'Demo tenant namespace' },
  ];
}

function storageClassRows(): HarvesterResourceRow[] {
  const storage = buildStorageDashboard();
  return storage.backends.map((backend) => ({
    id: `sc-${backend.id}`,
    name: backend.label.toLowerCase().replace(/\s+/g, '-'),
    type: HCI.STORAGE,
    state: backend.driverHealth === 'healthy' ? 'ready' : backend.driverHealth === 'degraded' ? 'degraded' : 'error',
    age: '60d',
    storageClass: backend.label,
    size: `${backend.capacityTiB} TiB`,
    extra: { iops: String(backend.iops), driver: backend.csiTemplate },
  }));
}

function networkRows(): HarvesterResourceRow[] {
  return [
    { id: 'net-mgmt', name: 'mgmt', namespace: 'harvester-system', type: HCI.NETWORK_ATTACHMENT, state: 'ready', age: '45d', description: 'Management VLAN' },
    { id: 'net-vm', name: 'vm-network', namespace: 'default', type: HCI.NETWORK_ATTACHMENT, state: 'ready', age: '30d', description: 'Default VM network' },
    { id: 'net-storage', name: 'storage-net', namespace: 'harvester-system', type: HCI.NETWORK_ATTACHMENT, state: 'ready', age: '45d', description: 'Storage replication network' },
  ];
}

function settingRows(): HarvesterResourceRow[] {
  return [
    { id: 'set-version', name: 'server-version', type: HCI.SETTING, state: 'ready', age: '—', extra: { value: 'v1.4.2+nexus' } },
    { id: 'set-ui', name: 'ui-source', type: HCI.SETTING, state: 'ready', age: '—', extra: { value: 'nexus-cockpit' } },
    { id: 'set-backup', name: 'backup-target', type: HCI.SETTING, state: 'ready', age: '—', extra: { value: 's3://nexus-backups' } },
    { id: 'set-http', name: 'http-proxy', type: HCI.SETTING, state: 'ready', age: '—', extra: { value: '(none)' } },
    { id: 'set-ssl', name: 'ssl-certificates', type: HCI.SETTING, state: 'ready', age: '—', extra: { value: 'auto' } },
  ];
}

function addonRows(): HarvesterResourceRow[] {
  return [
    { id: 'addon-mon', name: 'rancher-monitoring', type: HCI.ADD_ONS, state: 'ready', age: '60d', description: 'Prometheus + Grafana + Alertmanager' },
    { id: 'addon-log', name: 'rancher-logging', type: HCI.ADD_ONS, state: 'ready', age: '60d', description: 'Banzai Cloud logging operator' },
    { id: 'addon-vmimport', name: 'vm-import-controller', type: HCI.ADD_ONS, state: 'ready', age: '14d', description: 'VMware / OpenStack / OVA import' },
    { id: 'addon-nexus', name: 'nexus-xdr', type: HCI.ADD_ONS, state: 'ready', age: '3d', description: 'Nexus XDR sensor stack' },
  ];
}

function genericRows(type: HarvesterResourceType, label: string, count = 3): HarvesterResourceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${type}-${index}`,
    name: `${label}-${index + 1}`,
    namespace: index % 2 === 0 ? 'default' : 'harvester-system',
    type,
    state: index === 0 ? 'ready' : index === 1 ? 'pending' : 'unknown',
    age: ageFromMinutes(60 + index * 90),
  }));
}

const DEMO_BUILDERS: Partial<Record<HarvesterResourceType, () => HarvesterResourceRow[]>> = {
  [HCI.DASHBOARD]: () => [],
  [HCI.VM]: vmRows,
  [HCI.HOST]: hostRows,
  [HCI.VOLUME]: volumeRows,
  [HCI.IMAGE]: imageRows,
  [HCI.NAMESPACE]: namespaceRows,
  [HCI.STORAGE]: storageClassRows,
  [HCI.NETWORK_ATTACHMENT]: networkRows,
  [HCI.CLUSTER_NETWORK]: () => [{ id: 'cn-1', name: 'cluster-network', type: HCI.CLUSTER_NETWORK, state: 'ready', age: '60d' }],
  [HCI.VPC]: () => genericRows(HCI.VPC, 'vpc', 2),
  [HCI.NETWORK_POLICY]: () => genericRows(HCI.NETWORK_POLICY, 'netpol', 4),
  [HCI.LB]: () => genericRows(HCI.LB, 'lb', 2),
  [HCI.IP_POOL]: () => [{ id: 'ip-1', name: 'vm-ip-pool', type: HCI.IP_POOL, state: 'ready', age: '30d', extra: { subnet: '10.42.0.0/24', available: '42' } }],
  [HCI.SCHEDULE_VM_BACKUP]: () => genericRows(HCI.SCHEDULE_VM_BACKUP, 'schedule', 2),
  [HCI.BACKUP]: () => genericRows(HCI.BACKUP, 'backup', 3),
  [HCI.SNAPSHOT]: () => genericRows(HCI.SNAPSHOT, 'vol-snap', 4),
  [HCI.VM_SNAPSHOT]: () => genericRows(HCI.VM_SNAPSHOT, 'vm-snap', 3),
  [HCI.ALERTMANAGERCONFIG]: () => genericRows(HCI.ALERTMANAGERCONFIG, 'alertcfg', 2),
  [HCI.CLUSTER_FLOW]: () => genericRows(HCI.CLUSTER_FLOW, 'cflow', 2),
  [HCI.CLUSTER_OUTPUT]: () => genericRows(HCI.CLUSTER_OUTPUT, 'coutput', 2),
  [HCI.FLOW]: () => genericRows(HCI.FLOW, 'flow', 3),
  [HCI.OUTPUT]: () => genericRows(HCI.OUTPUT, 'output', 3),
  [HCI.VM_VERSION]: () => genericRows(HCI.VM_VERSION, 'template', 3),
  [HCI.SSH]: () => genericRows(HCI.SSH, 'ssh-key', 2),
  [HCI.CLOUD_TEMPLATE]: () => genericRows(HCI.CLOUD_TEMPLATE, 'cloud-init', 2),
  [HCI.PCI_DEVICE]: () => genericRows(HCI.PCI_DEVICE, 'pci', 4),
  [HCI.SR_IOV]: () => genericRows(HCI.SR_IOV, 'sriov', 2),
  [HCI.VGPU_DEVICE]: () => genericRows(HCI.VGPU_DEVICE, 'vgpu', 2),
  [HCI.SR_IOVGPU_DEVICE]: () => genericRows(HCI.SR_IOVGPU_DEVICE, 'sriovgpu', 1),
  [HCI.USB_DEVICE]: () => genericRows(HCI.USB_DEVICE, 'usb', 3),
  [HCI.MIG_CONFIGURATION]: () => genericRows(HCI.MIG_CONFIGURATION, 'mig', 1),
  [HCI.ADD_ONS]: addonRows,
  [HCI.SECRET]: () => genericRows(HCI.SECRET, 'secret', 3),
  [HCI.SETTING]: settingRows,
};

export function buildDemoResourceList(type: HarvesterResourceType): HarvesterResourceListPayload {
  const builder = DEMO_BUILDERS[type];
  const rows = builder ? builder() : [];
  return {
    type,
    dataSource: 'demo',
    rows,
    total: rows.length,
    clusterVersion: 'v1.4.2+nexus',
  };
}

export function buildDemoDashboard(): HarvesterDashboardPayload {
  const machines = buildMachinesDashboard();
  const storage = buildStorageDashboard();
  const vmCount = machines.fleet.filter((r) => r.kind === 'vm').length;
  const nodeCount = 5;
  const totalCap = storage.backends.reduce((sum, b) => sum + b.capacityTiB, 0);
  const usedCap = storage.backends.reduce((sum, b) => sum + b.capacityTiB * (b.usagePercent / 100), 0);

  return {
    dataSource: 'demo',
    clusterVersion: 'v1.4.2+nexus',
    nodeCount,
    vmCount,
    volumeCount: storage.pvcs.length,
    imageCount: 4,
    cpuPercent: 42.8,
    ramPercent: 61.2,
    storageUsedTiB: Math.round(usedCap * 10) / 10,
    storageTotalTiB: Math.round(totalCap * 10) / 10,
    recentEvents: [
      { time: '2m ago', level: 'info', message: 'VM demo-api-01 started on node-02' },
      { time: '8m ago', level: 'info', message: 'Longhorn volume pvc-data-03 replica rebuild complete' },
      { time: '15m ago', level: 'warn', message: 'Node node-03 CPU pressure above 85%' },
      { time: '22m ago', level: 'info', message: 'Backup schedule nightly-vm-backup completed' },
      { time: '41m ago', level: 'error', message: 'Image download windows-server-2022 stalled — retrying' },
    ],
  };
}

export interface RouteNode {
  id: string;
  label: string;
  role: 'control-plane' | 'edge' | 'compute' | 'storage' | 'vcluster';
  x: number;
  y: number;
  health: number;
  status: 'online' | 'syncing' | 'draining' | 'watch';
}

export interface RouteEdge {
  id: string;
  from: string;
  to: string;
  channel: 'mgmt' | 'storage' | 'mesh' | 'vm' | 'gitops';
  load: number;
  packets: number;
}

export interface VlanLane {
  id: string;
  name: string;
  vlanId: number;
  cidr: string;
  pods: number;
  vms: number;
  egressMbps: number;
  ingressMbps: number;
}

export interface IngressRoute {
  id: string;
  host: string;
  service: string;
  rps: number;
  p95Latency: number;
  meshProvider: 'istio' | 'linkerd' | 'cilium';
  tls: 'managed' | 'manual' | 'mtls';
}

export interface NetworkPolicyCell {
  source: string;
  target: string;
  allow: boolean;
  protocol: 'tcp' | 'udp' | 'sctp';
}

export interface NetworkingDashboard {
  id: 'networking';
  title: 'Networking & Service Mesh';
  topology: { nodes: RouteNode[]; edges: RouteEdge[] };
  vlans: VlanLane[];
  ingressRoutes: IngressRoute[];
  policyMatrix: NetworkPolicyCell[];
  nicBonds: { name: string; speedGbps: number; rxMbps: number; txMbps: number; state: 'up' | 'degraded' | 'down' }[];
  vip: { mode: 'static' | 'dhcp'; address: string; floating: boolean };
}

export interface StorageBackendCard {
  id: string;
  label: string;
  kind: 'block' | 'file' | 'object';
  usagePercent: number;
  capacityTiB: number;
  iops: number;
  readMiBs: number;
  writeMiBs: number;
  driverHealth: 'healthy' | 'degraded' | 'critical';
  csiTemplate: string;
  features: string[];
}

export interface PvcRow {
  id: string;
  name: string;
  namespace: string;
  storageClass: string;
  sizeGiB: number;
  status: 'bound' | 'pending' | 'released';
  accessMode: 'RWO' | 'ROX' | 'RWX';
}

export interface SnapshotShelfItem {
  id: string;
  workload: string;
  driver: string;
  takenAt: string;
  size: string;
  replicated: boolean;
  retentionPolicy: string;
}

export interface StorageDashboard {
  id: 'storage';
  title: 'Storage Fabric';
  backends: StorageBackendCard[];
  pvcs: PvcRow[];
  snapshots: SnapshotShelfItem[];
  replicationLinks: { source: string; target: string; lagSeconds: number; mode: 'zfs' | 'longhorn' | 'pbs' | 'cross-cluster' }[];
}

export interface MachineRow {
  id: string;
  name: string;
  kind: 'vm' | 'lxc' | 'docker' | 'pod';
  host: string;
  cpuPercent: number;
  ramGiB: number;
  ramAllocGiB: number;
  status: 'running' | 'paused' | 'migrating' | 'snapshot';
  haEnabled: boolean;
  affinity: 'pin' | 'avoid' | 'none';
}

export interface MigrationArc {
  id: string;
  workload: string;
  kind: 'vm' | 'lxc' | 'docker';
  source: string;
  target: string;
  progress: number;
  preservesMemory: boolean;
  estimatedSeconds: number;
}

export interface ConsoleChip {
  id: string;
  type: 'novnc' | 'xterm' | 'serial';
  target: string;
  state: 'idle' | 'active';
}

export interface MachinesDashboard {
  id: 'machines';
  title: 'Machines & Containers';
  fleet: MachineRow[];
  migrations: MigrationArc[];
  affinityRules: { id: string; name: string; mode: 'together' | 'apart'; members: string[] }[];
  ha: { name: string; restartWindowSeconds: number; lastEvent: string; active: boolean }[];
  consoleChips: ConsoleChip[];
}

export interface CpuCore {
  id: number;
  utilizationPercent: number;
  frequencyGhz: number;
  thread: 'p' | 'e';
}

export interface NumaZone {
  id: string;
  cores: CpuCore[];
  localRamGiB: number;
  remoteHitsPct: number;
}

export interface MemoryTier {
  id: 'dram' | 'nvme' | 'phase-change' | 'swap';
  label: string;
  capacityGiB: number;
  usedGiB: number;
  latencyNs: number;
  throughputGiBs: number;
}

export interface PressureSample {
  label: string;
  cpuPressure: number;
  memoryPressure: number;
  ioPressure: number;
}

export interface ProcessorMemoryDashboard {
  id: 'processor-memory';
  title: 'Processor & Memory';
  numaZones: NumaZone[];
  memoryTiers: MemoryTier[];
  pressureWaterfall: PressureSample[];
  swapDevices: { device: string; sizeGiB: number; usedGiB: number; priority: number }[];
  hugepages: { sizeMiB: number; allocated: number; free: number }[];
}

export interface CostRow {
  id: string;
  workload: string;
  cpuHours: number;
  ramGbHours: number;
  storageGbMonth: number;
  monthlyEuro: number;
  trendPercent: number;
}

export interface PowerRow {
  id: string;
  node: string;
  watts: number;
  kwhMonth: number;
  co2KgMonth: number;
  pue: number;
}

export interface RightSizingHint {
  workload: string;
  hint: 'oversized-cpu' | 'oversized-ram' | 'undersized-cpu' | 'undersized-ram' | 'idle';
  detail: string;
}

export interface ComplianceLane {
  framework: 'BSI Grundschutz' | 'ISO 27001' | 'NIS2' | 'SOC 2';
  hardeningScore: number;
  controlsCovered: number;
  controlsTotal: number;
}

export interface CveBucket {
  severity: 'critical' | 'high' | 'medium' | 'low';
  count: number;
  trend: number;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface GitOpsTarget {
  id: string;
  name: string;
  provider: 'argocd' | 'flux' | 'jenkins-x';
  syncState: 'synced' | 'drift' | 'syncing' | 'failed';
  revision: string;
  lastSyncSeconds: number;
}

export interface BackupSlaRow {
  cluster: string;
  datastore: string;
  rpoMinutes: number;
  lastBackupMinutesAgo: number;
  verifyPassed: boolean;
}

export interface DrPlan {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  bootOrder: string[];
  lastDrill: string;
}

export interface OperationsDashboard {
  id: 'operations';
  title: 'Operations & Compliance';
  cost: CostRow[];
  power: PowerRow[];
  rightSizing: RightSizingHint[];
  compliance: ComplianceLane[];
  cve: CveBucket[];
  audit: AuditEvent[];
  gitops: GitOpsTarget[];
  backupSla: BackupSlaRow[];
  drPlans: DrPlan[];
}

export type DashboardAny =
  | NetworkingDashboard
  | StorageDashboard
  | MachinesDashboard
  | ProcessorMemoryDashboard
  | OperationsDashboard;

export function buildNetworkingDashboard(): NetworkingDashboard {
  const nodes: RouteNode[] = [
    { id: 'cp', label: 'control-plane', role: 'control-plane', x: 50, y: 12, health: 98, status: 'online' },
    { id: 'edge-a', label: 'edge-a', role: 'edge', x: 18, y: 38, health: 92, status: 'syncing' },
    { id: 'edge-b', label: 'edge-b', role: 'edge', x: 82, y: 38, health: 95, status: 'online' },
    { id: 'cpu-01', label: 'compute-01', role: 'compute', x: 24, y: 68, health: 88, status: 'online' },
    { id: 'cpu-02', label: 'compute-02', role: 'compute', x: 50, y: 78, health: 84, status: 'watch' },
    { id: 'cpu-03', label: 'compute-03', role: 'compute', x: 76, y: 68, health: 90, status: 'online' },
    { id: 'stor', label: 'ceph-rack', role: 'storage', x: 50, y: 48, health: 96, status: 'online' },
    { id: 'vcl', label: 'vcluster-edge', role: 'vcluster', x: 50, y: 92, health: 91, status: 'online' },
  ];
  const edges: RouteEdge[] = [
    { id: 'e1', from: 'cp', to: 'edge-a', channel: 'mgmt', load: 42, packets: 18420 },
    { id: 'e2', from: 'cp', to: 'edge-b', channel: 'mgmt', load: 38, packets: 16880 },
    { id: 'e3', from: 'edge-a', to: 'cpu-01', channel: 'vm', load: 71, packets: 92110 },
    { id: 'e4', from: 'edge-b', to: 'cpu-03', channel: 'vm', load: 66, packets: 84820 },
    { id: 'e5', from: 'cpu-01', to: 'stor', channel: 'storage', load: 84, packets: 142340 },
    { id: 'e6', from: 'cpu-02', to: 'stor', channel: 'storage', load: 79, packets: 128720 },
    { id: 'e7', from: 'cpu-03', to: 'stor', channel: 'storage', load: 81, packets: 134440 },
    { id: 'e8', from: 'stor', to: 'vcl', channel: 'mesh', load: 54, packets: 64210 },
    { id: 'e9', from: 'cp', to: 'vcl', channel: 'gitops', load: 31, packets: 14110 },
  ];
  return {
    id: 'networking',
    title: 'Networking & Service Mesh',
    topology: { nodes, edges },
    vlans: [
      { id: 'vlan-10', name: 'mgmt-bo', vlanId: 10, cidr: '10.10.10.0/24', pods: 0, vms: 12, egressMbps: 220, ingressMbps: 190 },
      { id: 'vlan-20', name: 'workload-bo', vlanId: 20, cidr: '10.10.20.0/22', pods: 184, vms: 36, egressMbps: 1820, ingressMbps: 1610 },
      { id: 'vlan-30', name: 'storage-bo', vlanId: 30, cidr: '10.10.30.0/24', pods: 0, vms: 0, egressMbps: 6420, ingressMbps: 6210 },
      { id: 'vlan-40', name: 'tenant-a', vlanId: 40, cidr: '10.10.40.0/24', pods: 62, vms: 8, egressMbps: 410, ingressMbps: 380 },
      { id: 'vlan-50', name: 'tenant-b', vlanId: 50, cidr: '10.10.50.0/24', pods: 44, vms: 6, egressMbps: 290, ingressMbps: 260 },
    ],
    ingressRoutes: [
      { id: 'r1', host: 'api.payments.nexus.local', service: 'payments-api', rps: 1840, p95Latency: 38, meshProvider: 'istio', tls: 'mtls' },
      { id: 'r2', host: 'console.nexus.local', service: 'console-ui', rps: 220, p95Latency: 64, meshProvider: 'linkerd', tls: 'managed' },
      { id: 'r3', host: 'metrics.nexus.local', service: 'prometheus', rps: 96, p95Latency: 22, meshProvider: 'cilium', tls: 'managed' },
      { id: 'r4', host: 'argocd.nexus.local', service: 'argocd-server', rps: 18, p95Latency: 41, meshProvider: 'istio', tls: 'mtls' },
    ],
    policyMatrix: [
      { source: 'payments', target: 'ledger', allow: true, protocol: 'tcp' },
      { source: 'payments', target: 'fraud', allow: true, protocol: 'tcp' },
      { source: 'payments', target: 'audit', allow: false, protocol: 'tcp' },
      { source: 'ledger', target: 'fraud', allow: false, protocol: 'tcp' },
      { source: 'ledger', target: 'audit', allow: true, protocol: 'tcp' },
      { source: 'fraud', target: 'audit', allow: true, protocol: 'tcp' },
    ],
    nicBonds: [
      { name: 'mgmt-bo', speedGbps: 25, rxMbps: 190, txMbps: 220, state: 'up' },
      { name: 'workload-bo', speedGbps: 100, rxMbps: 38420, txMbps: 36810, state: 'up' },
      { name: 'storage-bo', speedGbps: 200, rxMbps: 162400, txMbps: 158220, state: 'up' },
      { name: 'rdma-bo', speedGbps: 200, rxMbps: 124820, txMbps: 121110, state: 'degraded' },
    ],
    vip: { mode: 'static', address: '10.10.40.20', floating: true },
  };
}

export function buildStorageDashboard(): StorageDashboard {
  const backends: StorageBackendCard[] = [
    { id: 'ceph', label: 'Ceph RBD/CephFS', kind: 'block', usagePercent: 72, capacityTiB: 480, iops: 142000, readMiBs: 4820, writeMiBs: 3920, driverHealth: 'healthy', csiTemplate: 'rook-ceph', features: ['snapshots', 'rwx', 'mirror'] },
    { id: 'longhorn', label: 'Longhorn', kind: 'block', usagePercent: 58, capacityTiB: 96, iops: 64200, readMiBs: 1840, writeMiBs: 1620, driverHealth: 'healthy', csiTemplate: 'longhorn.io', features: ['replicas', 'backup', 'restore'] },
    { id: 'nvme-of', label: 'NVMe-oF / TCP', kind: 'block', usagePercent: 41, capacityTiB: 64, iops: 318000, readMiBs: 12420, writeMiBs: 9810, driverHealth: 'healthy', csiTemplate: 'nvmeof.csi', features: ['ultra-low-latency'] },
    { id: 'rdma', label: 'NVMe over RDMA', kind: 'block', usagePercent: 36, capacityTiB: 32, iops: 412000, readMiBs: 18220, writeMiBs: 14820, driverHealth: 'degraded', csiTemplate: 'nvmeof.rdma', features: ['rdma', 'memory-tier'] },
    { id: 'zfs', label: 'ZFS over iSCSI', kind: 'block', usagePercent: 68, capacityTiB: 240, iops: 38400, readMiBs: 1240, writeMiBs: 980, driverHealth: 'healthy', csiTemplate: 'zfs.csi', features: ['snapshots', 'send-recv'] },
    { id: 'iscsi', label: 'iSCSI block', kind: 'block', usagePercent: 51, capacityTiB: 120, iops: 22400, readMiBs: 720, writeMiBs: 540, driverHealth: 'healthy', csiTemplate: 'iscsi.csi', features: ['shared-block'] },
    { id: 'nfs', label: 'NFS', kind: 'file', usagePercent: 64, capacityTiB: 180, iops: 14200, readMiBs: 480, writeMiBs: 320, driverHealth: 'healthy', csiTemplate: 'nfs.csi', features: ['rwx', 'export-shares'] },
    { id: 'smb', label: 'SMB/CIFS', kind: 'file', usagePercent: 47, capacityTiB: 60, iops: 8400, readMiBs: 240, writeMiBs: 180, driverHealth: 'healthy', csiTemplate: 'smb.csi', features: ['windows-share'] },
    { id: 'glusterfs', label: 'GlusterFS', kind: 'file', usagePercent: 39, capacityTiB: 96, iops: 11200, readMiBs: 320, writeMiBs: 240, driverHealth: 'healthy', csiTemplate: 'gluster.csi', features: ['distributed'] },
    { id: 'openebs', label: 'OpenEBS', kind: 'block', usagePercent: 33, capacityTiB: 24, iops: 18400, readMiBs: 520, writeMiBs: 380, driverHealth: 'healthy', csiTemplate: 'openebs.io', features: ['mayastor', 'jiva', 'cstor'] },
    { id: 'portworx', label: 'Portworx', kind: 'block', usagePercent: 44, capacityTiB: 80, iops: 84200, readMiBs: 2820, writeMiBs: 2340, driverHealth: 'healthy', csiTemplate: 'pxd.portworx.com', features: ['sync-dr', 'encryption'] },
    { id: 'local', label: 'Local path', kind: 'block', usagePercent: 22, capacityTiB: 16, iops: 6800, readMiBs: 180, writeMiBs: 140, driverHealth: 'healthy', csiTemplate: 'local-path', features: ['hostpath'] },
  ];
  return {
    id: 'storage',
    title: 'Storage Fabric',
    backends,
    pvcs: [
      { id: 'pvc-1', name: 'payments-data', namespace: 'fintech', storageClass: 'ceph-rbd', sizeGiB: 240, status: 'bound', accessMode: 'RWO' },
      { id: 'pvc-2', name: 'ledger-share', namespace: 'fintech', storageClass: 'nfs-export', sizeGiB: 480, status: 'bound', accessMode: 'RWX' },
      { id: 'pvc-3', name: 'analytics-warm', namespace: 'platform', storageClass: 'longhorn', sizeGiB: 120, status: 'bound', accessMode: 'RWO' },
      { id: 'pvc-4', name: 'observability', namespace: 'platform', storageClass: 'portworx', sizeGiB: 320, status: 'bound', accessMode: 'RWO' },
      { id: 'pvc-5', name: 'registry-cache', namespace: 'edge', storageClass: 'openebs-mayastor', sizeGiB: 64, status: 'pending', accessMode: 'RWO' },
      { id: 'pvc-6', name: 'finance-archive', namespace: 'finance', storageClass: 'smb-finance', sizeGiB: 1024, status: 'bound', accessMode: 'RWX' },
    ],
    snapshots: [
      { id: 'snap-1', workload: 'payments-data', driver: 'ceph-rbd', takenAt: '02:14', size: '38 GiB', replicated: true, retentionPolicy: 'hourly:24 daily:30 weekly:8' },
      { id: 'snap-2', workload: 'analytics-warm', driver: 'longhorn', takenAt: '01:50', size: '12 GiB', replicated: true, retentionPolicy: 'hourly:12 daily:7' },
      { id: 'snap-3', workload: 'ledger-share', driver: 'nfs', takenAt: '00:30', size: '94 GiB', replicated: false, retentionPolicy: 'daily:14' },
      { id: 'snap-4', workload: 'finance-archive', driver: 'smb', takenAt: '23:00', size: '210 GiB', replicated: true, retentionPolicy: 'weekly:12 monthly:6' },
    ],
    replicationLinks: [
      { source: 'edge-a / ceph', target: 'edge-b / ceph', lagSeconds: 4, mode: 'cross-cluster' },
      { source: 'analytics / longhorn', target: 'dr-site / longhorn', lagSeconds: 18, mode: 'longhorn' },
      { source: 'finance / zfs', target: 'dr-site / zfs', lagSeconds: 30, mode: 'zfs' },
      { source: 'payments / ceph', target: 'pbs / verify', lagSeconds: 0, mode: 'pbs' },
    ],
  };
}

export function buildMachinesDashboard(): MachinesDashboard {
  return {
    id: 'machines',
    title: 'Machines & Containers',
    fleet: [
      { id: 'vm-101', name: 'payments-vm-01', kind: 'vm', host: 'compute-01', cpuPercent: 64, ramGiB: 28, ramAllocGiB: 32, status: 'running', haEnabled: true, affinity: 'pin' },
      { id: 'vm-102', name: 'payments-vm-02', kind: 'vm', host: 'compute-02', cpuPercent: 58, ramGiB: 26, ramAllocGiB: 32, status: 'migrating', haEnabled: true, affinity: 'pin' },
      { id: 'lxc-21', name: 'fraud-lxc-01', kind: 'lxc', host: 'compute-02', cpuPercent: 42, ramGiB: 6, ramAllocGiB: 8, status: 'running', haEnabled: false, affinity: 'avoid' },
      { id: 'doc-31', name: 'registry-cache', kind: 'docker', host: 'edge-a', cpuPercent: 31, ramGiB: 2, ramAllocGiB: 4, status: 'running', haEnabled: false, affinity: 'none' },
      { id: 'pod-91', name: 'api-green-7c8', kind: 'pod', host: 'compute-03', cpuPercent: 21, ramGiB: 1.2, ramAllocGiB: 2, status: 'running', haEnabled: true, affinity: 'avoid' },
      { id: 'pod-92', name: 'argo-runner-bd2', kind: 'pod', host: 'compute-03', cpuPercent: 38, ramGiB: 1.6, ramAllocGiB: 2, status: 'snapshot', haEnabled: false, affinity: 'none' },
      { id: 'vm-105', name: 'analytics-vm', kind: 'vm', host: 'compute-01', cpuPercent: 71, ramGiB: 48, ramAllocGiB: 64, status: 'paused', haEnabled: true, affinity: 'pin' },
    ],
    migrations: [
      { id: 'mig-01', workload: 'payments-vm-02', kind: 'vm', source: 'compute-02', target: 'compute-03', progress: 64, preservesMemory: true, estimatedSeconds: 38 },
      { id: 'mig-02', workload: 'fraud-lxc-01', kind: 'lxc', source: 'compute-02', target: 'edge-b', progress: 41, preservesMemory: true, estimatedSeconds: 12 },
      { id: 'mig-03', workload: 'registry-cache', kind: 'docker', source: 'edge-a', target: 'edge-b', progress: 22, preservesMemory: true, estimatedSeconds: 6 },
    ],
    affinityRules: [
      { id: 'aff-1', name: 'payments-pair', mode: 'together', members: ['payments-vm-01', 'payments-vm-02'] },
      { id: 'aff-2', name: 'fraud-isolation', mode: 'apart', members: ['fraud-lxc-01', 'payments-vm-01'] },
      { id: 'aff-3', name: 'argo-spread', mode: 'apart', members: ['argo-runner-bd2', 'argo-runner-da1', 'argo-runner-fa9'] },
    ],
    ha: [
      { name: 'payments-vm-01', restartWindowSeconds: 45, lastEvent: 'auto-restart on compute-02 outage', active: true },
      { name: 'analytics-vm', restartWindowSeconds: 90, lastEvent: 'manual failover drill ok', active: true },
      { name: 'argo-runner-bd2', restartWindowSeconds: 30, lastEvent: 'pod restart by deployment', active: true },
    ],
    consoleChips: [
      { id: 'c-1', type: 'novnc', target: 'payments-vm-01', state: 'active' },
      { id: 'c-2', type: 'xterm', target: 'fraud-lxc-01', state: 'idle' },
      { id: 'c-3', type: 'serial', target: 'analytics-vm', state: 'idle' },
      { id: 'c-4', type: 'novnc', target: 'analytics-vm', state: 'idle' },
    ],
  };
}

export function buildProcessorMemoryDashboard(): ProcessorMemoryDashboard {
  const buildZone = (id: string, baseCores: number, baseUtil: number, localRam: number, remote: number): NumaZone => ({
    id,
    cores: Array.from({ length: baseCores }, (_, index) => ({
      id: index,
      utilizationPercent: Math.min(100, Math.max(4, baseUtil + ((index * 7) % 36) - 12)),
      frequencyGhz: 3.4 + (index % 4) * 0.1,
      thread: index % 4 === 0 ? 'e' : 'p',
    })),
    localRamGiB: localRam,
    remoteHitsPct: remote,
  });
  return {
    id: 'processor-memory',
    title: 'Processor & Memory',
    numaZones: [buildZone('numa-0', 32, 58, 256, 6), buildZone('numa-1', 32, 71, 256, 9)],
    memoryTiers: [
      { id: 'dram', label: 'DRAM DDR5', capacityGiB: 512, usedGiB: 388, latencyNs: 82, throughputGiBs: 64 },
      { id: 'nvme', label: 'Memory-tier NVMe', capacityGiB: 4096, usedGiB: 1820, latencyNs: 410, throughputGiBs: 18 },
      { id: 'phase-change', label: 'Phase-change tier', capacityGiB: 8192, usedGiB: 1240, latencyNs: 940, throughputGiBs: 9 },
      { id: 'swap', label: 'Swap (NVMe)', capacityGiB: 1024, usedGiB: 184, latencyNs: 2400, throughputGiBs: 4 },
    ],
    pressureWaterfall: [
      { label: 't-12', cpuPressure: 18, memoryPressure: 22, ioPressure: 14 },
      { label: 't-10', cpuPressure: 24, memoryPressure: 31, ioPressure: 18 },
      { label: 't-8', cpuPressure: 31, memoryPressure: 36, ioPressure: 21 },
      { label: 't-6', cpuPressure: 42, memoryPressure: 48, ioPressure: 26 },
      { label: 't-4', cpuPressure: 58, memoryPressure: 64, ioPressure: 34 },
      { label: 't-2', cpuPressure: 71, memoryPressure: 78, ioPressure: 42 },
      { label: 'now', cpuPressure: 68, memoryPressure: 81, ioPressure: 38 },
    ],
    swapDevices: [
      { device: '/dev/nvme0n1p3', sizeGiB: 512, usedGiB: 64, priority: 10 },
      { device: '/dev/nvme1n1p3', sizeGiB: 512, usedGiB: 120, priority: 10 },
    ],
    hugepages: [
      { sizeMiB: 2, allocated: 4096, free: 1280 },
      { sizeMiB: 1024, allocated: 64, free: 12 },
    ],
  };
}

export function buildOperationsDashboard(): OperationsDashboard {
  return {
    id: 'operations',
    title: 'Operations & Compliance',
    cost: [
      { id: 'c-1', workload: 'payments-vm-01', cpuHours: 720, ramGbHours: 23040, storageGbMonth: 240, monthlyEuro: 184.2, trendPercent: 4 },
      { id: 'c-2', workload: 'analytics-vm', cpuHours: 720, ramGbHours: 46080, storageGbMonth: 320, monthlyEuro: 312.6, trendPercent: -2 },
      { id: 'c-3', workload: 'ledger-share', cpuHours: 0, ramGbHours: 0, storageGbMonth: 480, monthlyEuro: 54.8, trendPercent: 1 },
      { id: 'c-4', workload: 'fraud-lxc-01', cpuHours: 540, ramGbHours: 4320, storageGbMonth: 32, monthlyEuro: 42.1, trendPercent: 8 },
      { id: 'c-5', workload: 'registry-cache', cpuHours: 300, ramGbHours: 1440, storageGbMonth: 64, monthlyEuro: 18.9, trendPercent: 0 },
    ],
    power: [
      { id: 'p-1', node: 'compute-01', watts: 420, kwhMonth: 302, co2KgMonth: 121, pue: 1.32 },
      { id: 'p-2', node: 'compute-02', watts: 388, kwhMonth: 280, co2KgMonth: 112, pue: 1.32 },
      { id: 'p-3', node: 'compute-03', watts: 442, kwhMonth: 318, co2KgMonth: 127, pue: 1.34 },
      { id: 'p-4', node: 'edge-a', watts: 168, kwhMonth: 121, co2KgMonth: 48, pue: 1.18 },
      { id: 'p-5', node: 'edge-b', watts: 174, kwhMonth: 125, co2KgMonth: 50, pue: 1.18 },
    ],
    rightSizing: [
      { workload: 'analytics-vm', hint: 'oversized-ram', detail: 'p95 usage 48 GiB on 64 GiB alloc; recommend 56 GiB' },
      { workload: 'payments-vm-02', hint: 'undersized-cpu', detail: '92% p95 utilization; bump to 16 vCPU or rebalance' },
      { workload: 'registry-cache', hint: 'idle', detail: 'avg 6% CPU over 14d; consolidate to shared edge node' },
      { workload: 'fraud-lxc-01', hint: 'undersized-ram', detail: 'OOM events x3 last 7d; bump 8 GiB -> 12 GiB' },
    ],
    compliance: [
      { framework: 'BSI Grundschutz', hardeningScore: 82, controlsCovered: 168, controlsTotal: 204 },
      { framework: 'ISO 27001', hardeningScore: 78, controlsCovered: 91, controlsTotal: 114 },
      { framework: 'NIS2', hardeningScore: 71, controlsCovered: 32, controlsTotal: 46 },
      { framework: 'SOC 2', hardeningScore: 84, controlsCovered: 64, controlsTotal: 78 },
    ],
    cve: [
      { severity: 'critical', count: 3, trend: -2 },
      { severity: 'high', count: 14, trend: 0 },
      { severity: 'medium', count: 42, trend: 6 },
      { severity: 'low', count: 96, trend: 12 },
    ],
    audit: [
      { id: 'a-1', actor: 'admin', action: 'rotate cluster token', target: 'control-plane', timestamp: '02:21', severity: 'warn' },
      { id: 'a-2', actor: 'ops-runner', action: 'kubectl apply manifest', target: 'fintech/*', timestamp: '02:18', severity: 'info' },
      { id: 'a-3', actor: 'argocd', action: 'sync', target: 'platform/observability', timestamp: '02:11', severity: 'info' },
      { id: 'a-4', actor: 'siem-forwarder', action: 'forward batch', target: 'splunk-hec', timestamp: '02:09', severity: 'info' },
      { id: 'a-5', actor: 'unknown', action: 'failed login', target: '10.10.40.144', timestamp: '01:54', severity: 'critical' },
    ],
    gitops: [
      { id: 'g-1', name: 'platform/observability', provider: 'argocd', syncState: 'synced', revision: '7f3a2c1', lastSyncSeconds: 38 },
      { id: 'g-2', name: 'fintech/payments', provider: 'argocd', syncState: 'drift', revision: '912ad88', lastSyncSeconds: 220 },
      { id: 'g-3', name: 'edge/registry-cache', provider: 'flux', syncState: 'syncing', revision: '4c1ee20', lastSyncSeconds: 8 },
      { id: 'g-4', name: 'tenant-a/release', provider: 'jenkins-x', syncState: 'failed', revision: 'aa1f203', lastSyncSeconds: 612 },
    ],
    backupSla: [
      { cluster: 'edge-a', datastore: 'pbs-primary', rpoMinutes: 60, lastBackupMinutesAgo: 18, verifyPassed: true },
      { cluster: 'edge-b', datastore: 'pbs-primary', rpoMinutes: 60, lastBackupMinutesAgo: 41, verifyPassed: true },
      { cluster: 'compute-01', datastore: 'pbs-secondary', rpoMinutes: 240, lastBackupMinutesAgo: 312, verifyPassed: false },
      { cluster: 'vcluster-edge', datastore: 'pbs-secondary', rpoMinutes: 120, lastBackupMinutesAgo: 96, verifyPassed: true },
    ],
    drPlans: [
      { id: 'dr-1', name: 'payments failover', primary: 'edge-a', secondary: 'edge-b', bootOrder: ['ledger', 'fraud', 'payments-api'], lastDrill: 'passed 9d ago' },
      { id: 'dr-2', name: 'analytics failover', primary: 'compute-01', secondary: 'compute-03', bootOrder: ['feature-store', 'analytics-vm'], lastDrill: 'passed 24d ago' },
    ],
  };
}

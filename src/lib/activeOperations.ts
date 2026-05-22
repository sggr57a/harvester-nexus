export interface CockpitMenuItem {
  id: 'workloads' | 'kubernetes' | 'storage' | 'compute' | 'security';
  label: string;
  signal: string;
}

export interface ActiveWorkItem {
  id: string;
  kind: 'pod-activity' | 'dynamic-scheduling' | 'migration' | 'docker-container' | 'persistent-volume' | 'remote-share';
  label: string;
  target: string;
  progress: number;
  status: 'active' | 'scheduling' | 'migrating' | 'allocating' | 'watching';
}

export interface ResourceGraph {
  label: string;
  unit: string;
  samples: number[];
}

export interface SecurityAudit {
  id: string;
  target: string;
  vulnerabilityType: 'PVE' | 'RBAC' | 'Image' | 'Network';
  riskScore: number;
  signal: string;
  recommendedAction: string;
}

export interface MemoryPressureStatus {
  visible: boolean;
  severity: 'normal' | 'warning' | 'critical';
  node: string;
  pressurePercent: number;
}

export interface MigrationProcess {
  id: string;
  workloadType: 'LXC' | 'Docker' | 'VirtualMachine';
  sourceNode: string;
  targetNode: string;
  processModel: 'vMotion-style live migration';
  memoryStatePreserved: boolean;
  requiresShutdown: boolean;
  progress: number;
}

export interface ResourceMonitoring {
  pageTitle: 'Resource Monitoring';
  menuItems: CockpitMenuItem[];
  workItems: ActiveWorkItem[];
  monitoredResourceClasses: string[];
  resourceGraphs: ResourceGraph[];
  memoryPressure: MemoryPressureStatus;
  migrationProcesses: MigrationProcess[];
  securityAudits: SecurityAudit[];
  summary: {
    activeWorkCount: number;
    highestSecurityScore: number;
    monitoredButHiddenCount: number;
    blackGlassPanels: boolean;
    animationStyle: 'drawn-hud';
  };
}

interface ResourceMonitoringOptions {
  memoryPressurePercent?: number;
}

export function buildResourceMonitoring(options: ResourceMonitoringOptions = {}): ResourceMonitoring {
  const memoryPressurePercent = options.memoryPressurePercent ?? 87;
  const workItems: ActiveWorkItem[] = [
    { id: 'pods-api-77', kind: 'pod-activity', label: 'Kubernetes pod activity', target: 'api-green / 14 pods active', progress: 72, status: 'active' },
    { id: 'scheduler-burst-04', kind: 'dynamic-scheduling', label: 'Dynamic resource scheduling', target: 'tenant-a / burst placement', progress: 58, status: 'scheduling' },
    { id: 'migration-vm-22', kind: 'migration', label: 'Live migration process', target: 'vm-prod-22 / edge-a -> edge-b', progress: 64, status: 'migrating' },
    { id: 'docker-reg-31', kind: 'docker-container', label: 'Docker container activity', target: 'registry-cache / 8 containers', progress: 76, status: 'active' },
    { id: 'pv-ceph-12', kind: 'persistent-volume', label: 'Persistent volume activity', target: 'ceph-rbd / pvc-payment-data', progress: 84, status: 'allocating' },
    { id: 'share-nfs-smb-09', kind: 'remote-share', label: 'Remote shares in use', target: 'NFS analytics + SMB finance', progress: 69, status: 'watching' },
  ];
  const migrationProcesses: MigrationProcess[] = [
    { id: 'lxc-shift-01', workloadType: 'LXC', sourceNode: 'edge-a', targetNode: 'edge-c', processModel: 'vMotion-style live migration', memoryStatePreserved: true, requiresShutdown: false, progress: 71 },
    { id: 'docker-shift-02', workloadType: 'Docker', sourceNode: 'worker-02', targetNode: 'worker-04', processModel: 'vMotion-style live migration', memoryStatePreserved: true, requiresShutdown: false, progress: 56 },
    { id: 'vm-shift-03', workloadType: 'VirtualMachine', sourceNode: 'compute-01', targetNode: 'compute-03', processModel: 'vMotion-style live migration', memoryStatePreserved: true, requiresShutdown: false, progress: 83 },
  ];
  const securityAudits: SecurityAudit[] = [
    {
      id: 'pve-workload-731',
      target: 'payment-api / privileged escalation vector',
      vulnerabilityType: 'PVE',
      riskScore: 94,
      signal: 'PVE_HOT',
      recommendedAction: 'isolate workload, revoke privileged pod policy, rotate service account token',
    },
    {
      id: 'rbac-wide-042',
      target: 'ops-runner / cluster-admin binding',
      vulnerabilityType: 'RBAC',
      riskScore: 87,
      signal: 'RBAC_WIDE',
      recommendedAction: 'scope role verbs to namespace and remove wildcard resources',
    },
    {
      id: 'image-cve-118',
      target: 'registry.local/nginx:legacy',
      vulnerabilityType: 'Image',
      riskScore: 78,
      signal: 'IMG_CVE',
      recommendedAction: 'replace base image and trigger rollout after scan passes',
    },
  ];

  return {
    pageTitle: 'Resource Monitoring',
    menuItems: [
      { id: 'workloads', label: 'Workloads', signal: 'POD_IO' },
      { id: 'kubernetes', label: 'Kubernetes', signal: 'K8S_PV' },
      { id: 'storage', label: 'Storage', signal: 'CSI_AL' },
      { id: 'compute', label: 'Compute', signal: 'CPU_RAM' },
      { id: 'security', label: 'Security', signal: 'AUDIT' },
    ],
    workItems,
    monitoredResourceClasses: [
      'pods',
      'dynamic-scheduler',
      'lxc',
      'docker-containers',
      'virtual-machines',
      'persistent-volumes',
      'ceph',
      'nfs',
      'smb',
      'longhorn',
      'cpu',
      'ram',
      'swap',
      'storage',
    ],
    resourceGraphs: [
      { label: 'CPU', unit: '%', samples: [22, 31, 48, 44, 62, 71, 66, 84, 77, 82, 69, 74] },
      { label: 'RAM', unit: '%', samples: [38, 42, 51, 57, 53, 61, 70, 68, 76, 81, 79, 85] },
      { label: 'Swap', unit: '%', samples: [2, 4, 5, 7, 8, 11, 9, 14, 12, 18, 16, 21] },
      { label: 'Storage', unit: '%', samples: [44, 48, 52, 57, 61, 65, 69, 72, 74, 78, 82, 85] },
      { label: 'Ceph', unit: 'IOPS', samples: [14, 28, 44, 37, 63, 58, 71, 89, 76, 92, 88, 96] },
      { label: 'Longhorn', unit: 'MiB/s', samples: [21, 26, 34, 48, 42, 55, 63, 68, 72, 78, 74, 81] },
    ],
    memoryPressure: {
      visible: memoryPressurePercent >= 80,
      severity: memoryPressurePercent >= 92 ? 'critical' : memoryPressurePercent >= 80 ? 'warning' : 'normal',
      node: 'edge-a',
      pressurePercent: memoryPressurePercent,
    },
    migrationProcesses,
    securityAudits,
    summary: {
      activeWorkCount: workItems.length,
      highestSecurityScore: Math.max(...securityAudits.map((audit) => audit.riskScore)),
      monitoredButHiddenCount: 8,
      blackGlassPanels: true,
      animationStyle: 'drawn-hud',
    },
  };
}

export const buildActiveOperations = buildResourceMonitoring;

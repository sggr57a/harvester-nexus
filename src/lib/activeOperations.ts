export interface CockpitMenuItem {
  id: 'command' | 'workloads' | 'storage' | 'resources' | 'security';
  label: string;
  signal: string;
}

export interface ActiveWorkItem {
  id: string;
  kind: 'pod-drain' | 'pod-create' | 'storage-allocation' | 'resource-pressure';
  label: string;
  target: string;
  progress: number;
  status: 'draining' | 'creating' | 'allocating' | 'watching';
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

export interface ActiveOperations {
  menuItems: CockpitMenuItem[];
  workItems: ActiveWorkItem[];
  resourceGraphs: ResourceGraph[];
  securityAudits: SecurityAudit[];
  summary: {
    activeWorkCount: number;
    highestSecurityScore: number;
    blackGlassPanels: boolean;
    animationStyle: 'drawn-hud';
  };
}

export function buildActiveOperations(): ActiveOperations {
  const workItems: ActiveWorkItem[] = [
    { id: 'drain-edge-a-01', kind: 'pod-drain', label: 'Pods draining', target: 'edge-a / kube-system', progress: 68, status: 'draining' },
    { id: 'create-api-77', kind: 'pod-create', label: 'Pods creating', target: 'api-green / default', progress: 42, status: 'creating' },
    { id: 'alloc-longhorn-12', kind: 'storage-allocation', label: 'Storage allocation', target: 'longhorn-replica-12', progress: 84, status: 'allocating' },
    { id: 'pressure-cpu-09', kind: 'resource-pressure', label: 'Resource pressure', target: 'control-plane / cpu', progress: 73, status: 'watching' },
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
    menuItems: [
      { id: 'command', label: 'Command', signal: 'HUD_00' },
      { id: 'workloads', label: 'Workloads', signal: 'POD_IO' },
      { id: 'storage', label: 'Storage', signal: 'CSI_AL' },
      { id: 'resources', label: 'Resources', signal: 'RES_TX' },
      { id: 'security', label: 'Security', signal: 'AUDIT' },
    ],
    workItems,
    resourceGraphs: [
      { label: 'CPU', unit: '%', samples: [22, 31, 48, 44, 62, 71, 66, 84, 77, 82, 69, 74] },
      { label: 'Memory', unit: '%', samples: [38, 42, 51, 57, 53, 61, 70, 68, 76, 81, 79, 85] },
      { label: 'Storage IO', unit: 'MiB/s', samples: [14, 28, 44, 37, 63, 58, 71, 89, 76, 92, 88, 96] },
      { label: 'Network', unit: 'Gb/s', samples: [8, 11, 19, 23, 18, 29, 41, 35, 48, 52, 47, 61] },
    ],
    securityAudits,
    summary: {
      activeWorkCount: workItems.length,
      highestSecurityScore: Math.max(...securityAudits.map((audit) => audit.riskScore)),
      blackGlassPanels: true,
      animationStyle: 'drawn-hud',
    },
  };
}

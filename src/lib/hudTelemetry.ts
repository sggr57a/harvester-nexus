export interface HudMetric {
  label: string;
  value: number;
  unit: string;
  trend: string;
  status: 'stable' | 'active' | 'surging';
}

export interface HudRing {
  label: string;
  value: number;
}

export interface HudNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'online' | 'syncing' | 'watching';
}

export interface HudToggle {
  label: string;
  enabled: boolean;
}

export interface HudStatusRail {
  label: string;
  value: number;
}

export interface HudRadioGroup {
  label: string;
  options: { label: string; active: boolean }[];
}

export interface HudScanPanel {
  label: string;
  value: string;
  bars: number[];
}

export interface HudNavigationTab {
  id: 'dashboard' | 'active-work' | 'security' | 'storage';
  label: string;
  signal: string;
  active: boolean;
}

export interface HudGraphWidget {
  label: string;
  renderMode: 'line' | 'bars' | 'radial' | 'matrix';
  drawDelayMs: number;
  samples: number[];
}

export interface HudControlSurface {
  label: string;
  animation: 'unfold' | 'expand' | 'collapse';
  options: { label: string; active: boolean; signal: string }[];
}

export interface HudTelemetry {
  metrics: HudMetric[];
  storageRings: HudRing[];
  nodes: HudNode[];
  throughputBars: number[];
  lineSeries: number[];
  toggles: HudToggle[];
  menuModes: string[];
  navigationTabs: HudNavigationTab[];
  graphWidgets: HudGraphWidget[];
  controlSurfaces: HudControlSurface[];
  statusRails: HudStatusRail[];
  radioGroups: HudRadioGroup[];
  scanPanels: HudScanPanel[];
  microLabels: string[];
  eventFeed: string[];
}

export function buildHudTelemetry(): HudTelemetry {
  return {
    metrics: [
      { label: 'Cluster health', value: 98, unit: '%', trend: '+4.2%', status: 'stable' },
      { label: 'Workload sync', value: 87, unit: '%', trend: '+12 ops/min', status: 'active' },
      { label: 'Manifest validity', value: 94, unit: '%', trend: 'schema clean', status: 'stable' },
      { label: 'Network mesh', value: 76, unit: '%', trend: '3 routes hot', status: 'surging' },
      { label: 'Pod activity', value: 91, unit: '%', trend: '38 pods', status: 'active' },
      { label: 'Ceph usage', value: 63, unit: '%', trend: 'rbd hot', status: 'active' },
      { label: 'RAM pressure', value: 81, unit: '%', trend: 'watch edge-a', status: 'surging' },
      { label: 'Live migration', value: 57, unit: '%', trend: '3 streams', status: 'active' },
    ],
    storageRings: [
      { label: 'Ceph', value: 82 },
      { label: 'Longhorn', value: 68 },
      { label: 'NVMe-oF', value: 91 },
    ],
    nodes: [
      { id: 'n1', label: 'control-plane', x: 50, y: 20, status: 'online' },
      { id: 'n2', label: 'edge-a', x: 22, y: 58, status: 'syncing' },
      { id: 'n3', label: 'edge-b', x: 78, y: 58, status: 'watching' },
      { id: 'n4', label: 'vcluster', x: 50, y: 82, status: 'online' },
    ],
    throughputBars: [38, 74, 48, 89, 64, 93, 58, 81, 44, 72, 96, 69],
    lineSeries: [32, 44, 41, 68, 54, 72, 61, 88, 77, 94, 82, 97],
    toggles: [
      { label: 'Dry-run', enabled: true },
      { label: 'vCluster', enabled: true },
      { label: 'CSI', enabled: true },
      { label: 'Mesh', enabled: true },
      { label: 'Auto apply', enabled: false },
      { label: 'Audit lock', enabled: true },
    ],
    menuModes: ['Overview', 'Validate', 'Deploy', 'Observe'],
    navigationTabs: [
      { id: 'dashboard', label: 'Command', signal: 'TX_001', active: true },
      { id: 'active-work', label: 'Active Work', signal: 'OPS_284', active: false },
      { id: 'security', label: 'Security', signal: 'PVE_SCAN', active: false },
      { id: 'storage', label: 'Storage', signal: 'CSI_IO', active: false },
    ],
    graphWidgets: [
      { label: 'CPU trace', renderMode: 'line', drawDelayMs: 0, samples: [18, 24, 28, 46, 39, 62, 55, 71, 64, 82, 76, 88] },
      { label: 'Storage lanes', renderMode: 'bars', drawDelayMs: 140, samples: [32, 64, 45, 78, 52, 88, 61, 72, 91, 68, 84, 58] },
      { label: 'Security sweep', renderMode: 'radial', drawDelayMs: 280, samples: [86, 72, 94, 61, 79, 88, 68, 97] },
      { label: 'Menu matrix', renderMode: 'matrix', drawDelayMs: 420, samples: [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1] },
    ],
    controlSurfaces: [
      {
        label: 'Resource scope',
        animation: 'unfold',
        options: [
          { label: 'Pods', active: true, signal: 'POD' },
          { label: 'Containers', active: true, signal: 'CTR' },
          { label: 'VMs', active: true, signal: 'VM' },
          { label: 'LXC', active: true, signal: 'LXC' },
        ],
      },
      {
        label: 'Storage fabric',
        animation: 'expand',
        options: [
          { label: 'Ceph', active: true, signal: 'CEPH' },
          { label: 'Longhorn', active: true, signal: 'LH' },
          { label: 'NFS/SMB', active: true, signal: 'SHR' },
          { label: 'NVMe RDMA', active: true, signal: 'RDMA' },
        ],
      },
      {
        label: 'Compute watch',
        animation: 'collapse',
        options: [
          { label: 'CPU', active: true, signal: 'CPU' },
          { label: 'RAM', active: true, signal: 'RAM' },
          { label: 'Swap', active: true, signal: 'SWP' },
          { label: 'Pressure', active: false, signal: 'PRS' },
        ],
      },
    ],
    statusRails: [
      { label: 'RAD_CP', value: 82 },
      { label: 'API_TX', value: 74 },
      { label: 'CSI_IO', value: 91 },
      { label: 'MESH_RT', value: 68 },
      { label: 'VC_SYNC', value: 88 },
      { label: 'AUDIT', value: 79 },
    ],
    radioGroups: [
      {
        label: 'Mode matrix',
        options: [
          { label: 'A1', active: true },
          { label: 'A2', active: false },
          { label: 'A3', active: true },
          { label: 'A4', active: false },
        ],
      },
      {
        label: 'Routing',
        options: [
          { label: 'R1', active: false },
          { label: 'R2', active: true },
          { label: 'R3', active: true },
          { label: 'R4', active: false },
        ],
      },
      {
        label: 'Apply gate',
        options: [
          { label: 'G1', active: true },
          { label: 'G2', active: true },
          { label: 'G3', active: false },
          { label: 'G4', active: true },
        ],
      },
    ],
    scanPanels: [
      { label: 'Volume scan', value: '92_002', bars: [62, 47, 80, 70, 88] },
      { label: 'Mesh scan', value: 'TS_23.45', bars: [35, 76, 52, 91, 64] },
    ],
    microLabels: ['X_300.1', 'RAD_CP_02.2', 'AUTOMATION SECT 04', 'MEMBRANE_SECT10', 'TS_23.45'],
    eventFeed: [
      'control-plane accepted manifest dry-run',
      'ceph-csi provisioner heartbeat green',
      'istio mesh route telemetry streaming',
      'argocd sync target awaiting approval',
      'vcluster preview channel warming',
    ],
  };
}

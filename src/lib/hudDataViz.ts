/**
 * hudDataViz
 * ----------
 * Pre-computed datasets used by the high-density HUD visualizations:
 * geo edge map, sankey flow, chord matrix, calendar heatmap, GPU
 * thermal strip, latency violin, and treemap. Every dataset is
 * deterministic at module load so the dashboards animate against a
 * stable backdrop; the live `EnvironmentSnapshot` then perturbs the
 * rendering on each tick (handled by the consumer components).
 */

/* -------------------- Geo edge map -------------------- */

export interface GeoEdgeNode {
  id: string;
  /** ISO region label, e.g. "US-WEST-2" */
  region: string;
  /** Mercator-projected x (0..100). */
  x: number;
  /** Mercator-projected y (0..100). */
  y: number;
  role: 'control' | 'edge' | 'storage' | 'gpu';
  workloads: number;
  rttMs: number;
}

export interface GeoEdgeArc {
  from: string;
  to: string;
  mbps: number;
  intensity: number; // 0..100
  /** Phase offset in seconds so arcs don't pulse in unison. */
  delay: number;
}

export interface GeoEdgeMap {
  nodes: GeoEdgeNode[];
  arcs: GeoEdgeArc[];
}

const EDGE_NODES: GeoEdgeNode[] = [
  { id: 'sea', region: 'US-WEST-2 / SEA', x: 13, y: 30, role: 'control', workloads: 184, rttMs: 4 },
  { id: 'iad', region: 'US-EAST-1 / IAD', x: 27, y: 36, role: 'edge', workloads: 142, rttMs: 11 },
  { id: 'dfw', region: 'US-CENTRAL / DFW', x: 19, y: 44, role: 'storage', workloads: 98, rttMs: 9 },
  { id: 'lhr', region: 'EU-WEST-2 / LHR', x: 47, y: 30, role: 'edge', workloads: 121, rttMs: 18 },
  { id: 'fra', region: 'EU-CENTRAL-1 / FRA', x: 51, y: 32, role: 'gpu', workloads: 88, rttMs: 22 },
  { id: 'sin', region: 'APAC-SE-1 / SIN', x: 76, y: 56, role: 'edge', workloads: 144, rttMs: 38 },
  { id: 'nrt', region: 'APAC-NE-1 / NRT', x: 85, y: 38, role: 'gpu', workloads: 102, rttMs: 41 },
  { id: 'syd', region: 'OCEANIA / SYD', x: 90, y: 78, role: 'storage', workloads: 71, rttMs: 56 },
  { id: 'gru', region: 'SOUTH-AM / GRU', x: 35, y: 76, role: 'edge', workloads: 64, rttMs: 47 },
  { id: 'cpt', region: 'AFRICA-S / CPT', x: 56, y: 78, role: 'storage', workloads: 42, rttMs: 61 },
];

const EDGE_ARCS: GeoEdgeArc[] = [
  { from: 'sea', to: 'iad', mbps: 18_400, intensity: 92, delay: 0 },
  { from: 'sea', to: 'nrt', mbps: 9_800, intensity: 74, delay: 0.6 },
  { from: 'iad', to: 'lhr', mbps: 14_200, intensity: 81, delay: 1.2 },
  { from: 'lhr', to: 'fra', mbps: 11_600, intensity: 70, delay: 1.8 },
  { from: 'fra', to: 'sin', mbps: 7_400, intensity: 63, delay: 0.3 },
  { from: 'sin', to: 'syd', mbps: 5_200, intensity: 55, delay: 0.9 },
  { from: 'sin', to: 'nrt', mbps: 8_900, intensity: 68, delay: 1.5 },
  { from: 'iad', to: 'gru', mbps: 4_800, intensity: 49, delay: 2.1 },
  { from: 'fra', to: 'cpt', mbps: 3_900, intensity: 41, delay: 2.7 },
  { from: 'dfw', to: 'iad', mbps: 12_300, intensity: 77, delay: 0.4 },
  { from: 'dfw', to: 'gru', mbps: 4_100, intensity: 44, delay: 1.1 },
];

export function buildGeoEdgeMap(): GeoEdgeMap {
  return { nodes: EDGE_NODES, arcs: EDGE_ARCS };
}

/* -------------------- Sankey flow -------------------- */

export interface SankeyNode {
  id: string;
  label: string;
  /** Column index (0-based, left to right). */
  column: number;
  /** Stable row offset 0..1 used for vertical layout. */
  row: number;
  category: 'workload' | 'cache' | 'storage' | 'network';
}

export interface SankeyLink {
  source: string;
  target: string;
  /** Flow weight in MB/s. */
  value: number;
  hue: number;
}

export interface SankeyDataset {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const SANKEY_NODES: SankeyNode[] = [
  { id: 'vm', label: 'KubeVirt VMs', column: 0, row: 0.15, category: 'workload' },
  { id: 'lxc', label: 'Incus LXC', column: 0, row: 0.45, category: 'workload' },
  { id: 'pod', label: 'K8s Pods', column: 0, row: 0.75, category: 'workload' },
  { id: 'arc', label: 'ARC L1', column: 1, row: 0.2, category: 'cache' },
  { id: 'l2', label: 'NVMe L2', column: 1, row: 0.55, category: 'cache' },
  { id: 'mesh', label: 'Mesh', column: 1, row: 0.85, category: 'network' },
  { id: 'longhorn', label: 'Longhorn', column: 2, row: 0.18, category: 'storage' },
  { id: 'ceph', label: 'Ceph RBD', column: 2, row: 0.42, category: 'storage' },
  { id: 'zfs', label: 'ZFS', column: 2, row: 0.66, category: 'storage' },
  { id: 'spdk', label: 'SPDK NoF', column: 2, row: 0.9, category: 'network' },
];

const SANKEY_LINKS: SankeyLink[] = [
  { source: 'vm', target: 'arc', value: 460, hue: 188 },
  { source: 'vm', target: 'l2', value: 220, hue: 198 },
  { source: 'vm', target: 'mesh', value: 130, hue: 208 },
  { source: 'lxc', target: 'arc', value: 180, hue: 142 },
  { source: 'lxc', target: 'l2', value: 320, hue: 152 },
  { source: 'lxc', target: 'mesh', value: 90, hue: 162 },
  { source: 'pod', target: 'arc', value: 110, hue: 38 },
  { source: 'pod', target: 'l2', value: 240, hue: 28 },
  { source: 'pod', target: 'mesh', value: 380, hue: 18 },
  { source: 'arc', target: 'longhorn', value: 320, hue: 188 },
  { source: 'arc', target: 'ceph', value: 240, hue: 198 },
  { source: 'arc', target: 'zfs', value: 190, hue: 168 },
  { source: 'l2', target: 'ceph', value: 280, hue: 198 },
  { source: 'l2', target: 'zfs', value: 220, hue: 168 },
  { source: 'l2', target: 'spdk', value: 280, hue: 320 },
  { source: 'mesh', target: 'spdk', value: 380, hue: 320 },
  { source: 'mesh', target: 'ceph', value: 220, hue: 198 },
];

export function buildSankey(): SankeyDataset {
  return { nodes: SANKEY_NODES, links: SANKEY_LINKS };
}

/* -------------------- Chord matrix (service mesh) -------------------- */

export interface ChordNode {
  id: string;
  label: string;
  color: string;
}

export interface ChordEdge {
  source: string;
  target: string;
  value: number;
}

export interface ChordDataset {
  nodes: ChordNode[];
  edges: ChordEdge[];
}

const CHORD_NODES: ChordNode[] = [
  { id: 'api',  label: 'api-gw',    color: '#33f7ff' },
  { id: 'auth', label: 'auth-svc',  color: '#a4f9ff' },
  { id: 'cat',  label: 'catalog',   color: '#7c3bff' },
  { id: 'cart', label: 'cart',      color: '#ff4af7' },
  { id: 'pay',  label: 'payments',  color: '#ffd166' },
  { id: 'ord',  label: 'orders',    color: '#36d399' },
  { id: 'ship', label: 'shipping',  color: '#75ff6a' },
  { id: 'rec',  label: 'recommend', color: '#ff7a59' },
  { id: 'log',  label: 'log-pipe',  color: '#9dff66' },
  { id: 'tel',  label: 'telemetry', color: '#67e8f9' },
];

const CHORD_EDGES: ChordEdge[] = [
  { source: 'api', target: 'auth', value: 92 },
  { source: 'api', target: 'cat',  value: 78 },
  { source: 'api', target: 'cart', value: 64 },
  { source: 'api', target: 'rec',  value: 41 },
  { source: 'auth', target: 'log', value: 36 },
  { source: 'cat', target: 'rec',  value: 58 },
  { source: 'cat', target: 'tel',  value: 22 },
  { source: 'cart', target: 'pay', value: 71 },
  { source: 'cart', target: 'ord', value: 65 },
  { source: 'pay', target: 'ord',  value: 48 },
  { source: 'ord', target: 'ship', value: 53 },
  { source: 'ship', target: 'tel', value: 18 },
  { source: 'rec', target: 'tel',  value: 24 },
  { source: 'log', target: 'tel',  value: 39 },
  { source: 'pay', target: 'log',  value: 28 },
];

export function buildChord(): ChordDataset {
  return { nodes: CHORD_NODES, edges: CHORD_EDGES };
}

/* -------------------- Calendar heatmap (7d x 24h) -------------------- */

export interface HeatmapCell {
  /** Day index 0..6 (Mon..Sun). */
  day: number;
  /** Hour index 0..23. */
  hour: number;
  /** Normalised intensity 0..1. */
  intensity: number;
}

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Deterministic synthetic activity heatmap: a baseline diurnal curve plus
 * day-of-week weighting, with weekends quieter and a midweek spike.
 */
export function buildActivityHeatmap(): { cells: HeatmapCell[]; dayLabels: string[] } {
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day += 1) {
    const dayWeight = day === 5 || day === 6 ? 0.55 : day === 2 ? 1.15 : 1.0;
    for (let hour = 0; hour < 24; hour += 1) {
      // Bell curve around 14:00, secondary lobe at 22:00
      const main = Math.exp(-((hour - 14) ** 2) / 30);
      const evening = 0.45 * Math.exp(-((hour - 22) ** 2) / 6);
      const morning = 0.25 * Math.exp(-((hour - 9) ** 2) / 8);
      // Deterministic jitter from (day, hour).
      const jitter = ((Math.sin(day * 7.13 + hour * 1.91) + 1) / 2) * 0.18;
      const raw = (main + evening + morning) * dayWeight + jitter;
      cells.push({ day, hour, intensity: Math.max(0, Math.min(1, raw)) });
    }
  }
  return { cells, dayLabels: DAY_LABELS };
}

/* -------------------- GPU thermal strip -------------------- */

export interface GpuThermal {
  id: string;
  model: string;
  tempC: number;
  utilization: number;
  powerW: number;
  /** Rolling 24-sample sparkline of utilization. */
  series: number[];
  status: 'nominal' | 'warm' | 'critical';
}

function seedSeries(seed: number, base: number, amp: number, length = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const v = base + Math.sin((i + seed) * 0.7) * amp + Math.cos((i + seed) * 1.3) * (amp * 0.4);
    out.push(Math.round(Math.max(5, Math.min(100, v))));
  }
  return out;
}

export function buildGpuThermals(): GpuThermal[] {
  const defs: Array<Omit<GpuThermal, 'series' | 'status'>> = [
    { id: 'gpu-0', model: 'H100-80GB',    tempC: 68, utilization: 87, powerW: 612 },
    { id: 'gpu-1', model: 'H100-80GB',    tempC: 71, utilization: 92, powerW: 638 },
    { id: 'gpu-2', model: 'H100-80GB',    tempC: 83, utilization: 96, powerW: 692 },
    { id: 'gpu-3', model: 'A100-40GB',    tempC: 62, utilization: 71, powerW: 358 },
    { id: 'gpu-4', model: 'A100-40GB',    tempC: 64, utilization: 78, powerW: 372 },
    { id: 'gpu-5', model: 'L40S',         tempC: 58, utilization: 54, powerW: 244 },
    { id: 'gpu-6', model: 'L40S',         tempC: 56, utilization: 49, powerW: 232 },
    { id: 'gpu-7', model: 'MI300X',       tempC: 74, utilization: 89, powerW: 588 },
  ];
  return defs.map((def, idx) => ({
    ...def,
    series: seedSeries(idx * 3.7, def.utilization, 14),
    status: def.tempC >= 80 ? 'critical' : def.tempC >= 70 ? 'warm' : 'nominal',
  }));
}

/* -------------------- Latency violin / percentile spread -------------------- */

export interface LatencyViolin {
  service: string;
  /** Width samples top-to-bottom; values 0..1. */
  samples: number[];
  p50: number;
  p95: number;
  p99: number;
  unitMs: number;
}

function violinShape(peak: number, spread: number, length = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const t = i / (length - 1);
    const x = (t - peak) / spread;
    const v = Math.exp(-(x * x) * 2.6);
    out.push(Math.max(0.05, v));
  }
  return out;
}

export function buildLatencyViolins(): LatencyViolin[] {
  return [
    { service: 'api-gw',     samples: violinShape(0.32, 0.22), p50: 4.1,  p95: 12.4, p99: 28.9, unitMs: 35 },
    { service: 'auth-svc',   samples: violinShape(0.28, 0.18), p50: 2.7,  p95:  8.1, p99: 19.5, unitMs: 25 },
    { service: 'catalog',    samples: violinShape(0.45, 0.28), p50: 7.6,  p95: 22.8, p99: 51.2, unitMs: 60 },
    { service: 'payments',   samples: violinShape(0.55, 0.18), p50: 12.4, p95: 31.0, p99: 78.4, unitMs: 90 },
    { service: 'orders',     samples: violinShape(0.42, 0.24), p50:  9.1, p95: 24.6, p99: 56.3, unitMs: 70 },
    { service: 'shipping',   samples: violinShape(0.38, 0.30), p50:  6.8, p95: 18.9, p99: 44.1, unitMs: 55 },
    { service: 'telemetry',  samples: violinShape(0.22, 0.30), p50:  3.2, p95:  9.6, p99: 18.7, unitMs: 25 },
  ];
}

/* -------------------- Storage treemap -------------------- */

export interface TreemapRect {
  id: string;
  label: string;
  /** Tile area weight (relative). */
  value: number;
  hue: number;
  category: 'hot' | 'warm' | 'cold' | 'archive';
}

export function buildStorageTreemap(): TreemapRect[] {
  return [
    { id: 't1', label: 'longhorn-fast',  value: 38, hue: 188, category: 'hot' },
    { id: 't2', label: 'ceph-rbd',       value: 26, hue: 168, category: 'hot' },
    { id: 't3', label: 'zfs-pool-a',     value: 18, hue: 142, category: 'warm' },
    { id: 't4', label: 'nvmeof-cache',   value: 12, hue: 198, category: 'hot' },
    { id: 't5', label: 'openebs-mayastor', value: 9, hue: 38, category: 'warm' },
    { id: 't6', label: 'cephfs',         value: 16, hue: 152, category: 'warm' },
    { id: 't7', label: 's3-archive',     value: 28, hue: 18, category: 'archive' },
    { id: 't8', label: 'tape-vault',     value: 14, hue: 350, category: 'archive' },
    { id: 't9', label: 'gluster-bricks', value: 7, hue: 270, category: 'cold' },
  ];
}

/* -------------------- Topology hex grid -------------------- */

export interface HexCell {
  q: number;
  r: number;
  status: 'idle' | 'active' | 'hot' | 'fault' | 'syncing';
  load: number;
  label?: string;
}

export function buildHexFabric(rows = 6, cols = 9): HexCell[] {
  const cells: HexCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let q = 0; q < cols; q += 1) {
      // Deterministic state pattern.
      const seed = Math.sin(q * 2.13 + r * 5.71);
      const v = (seed + 1) / 2;
      let status: HexCell['status'] = 'idle';
      if (v > 0.85) status = 'fault';
      else if (v > 0.7) status = 'hot';
      else if (v > 0.45) status = 'active';
      else if (v > 0.3) status = 'syncing';
      cells.push({ q, r, status, load: Math.round(v * 100) });
    }
  }
  return cells;
}

/* -------------------- Event timeline / Gantt -------------------- */

export interface TimelineTrack {
  id: string;
  label: string;
  category: 'apply' | 'migrate' | 'scan' | 'backup' | 'patch';
  /** Segments in 0..100 of the visible window. */
  segments: Array<{ start: number; end: number; status: 'ok' | 'warn' | 'crit'; tag: string }>;
}

export function buildTimeline(): TimelineTrack[] {
  return [
    { id: 'tl-apply', label: 'apply-pipeline', category: 'apply', segments: [
      { start: 2, end: 18, status: 'ok', tag: 'lint' },
      { start: 18, end: 34, status: 'ok', tag: 'diff' },
      { start: 34, end: 58, status: 'warn', tag: 'apply' },
      { start: 58, end: 76, status: 'ok', tag: 'rollout' },
      { start: 78, end: 92, status: 'ok', tag: 'verify' },
    ]},
    { id: 'tl-migrate', label: 'live-migrate', category: 'migrate', segments: [
      { start: 6, end: 22, status: 'ok', tag: 'precopy' },
      { start: 22, end: 41, status: 'ok', tag: 'iterate' },
      { start: 41, end: 49, status: 'warn', tag: 'stun' },
      { start: 49, end: 71, status: 'ok', tag: 'switch' },
    ]},
    { id: 'tl-scan', label: 'security-scan', category: 'scan', segments: [
      { start: 0, end: 28, status: 'ok', tag: 'cve' },
      { start: 30, end: 52, status: 'crit', tag: 'cis' },
      { start: 56, end: 78, status: 'warn', tag: 'policy' },
      { start: 80, end: 96, status: 'ok', tag: 'report' },
    ]},
    { id: 'tl-backup', label: 'snapshot-backup', category: 'backup', segments: [
      { start: 4, end: 24, status: 'ok', tag: 'quiesce' },
      { start: 24, end: 56, status: 'ok', tag: 'rsync' },
      { start: 56, end: 72, status: 'ok', tag: 'verify' },
      { start: 74, end: 88, status: 'warn', tag: 'replicate' },
    ]},
    { id: 'tl-patch', label: 'kernel-patch', category: 'patch', segments: [
      { start: 10, end: 28, status: 'ok', tag: 'stage' },
      { start: 30, end: 48, status: 'warn', tag: 'drain' },
      { start: 50, end: 72, status: 'ok', tag: 'apply' },
      { start: 74, end: 92, status: 'ok', tag: 'rejoin' },
    ]},
  ];
}

import { useMemo } from 'react';
import { useLiveTelemetry } from '../lib/liveTelemetry';
import { getTheme, type ThemeId } from '../lib/themes';
import {
  AnnotatedFft,
  AnnotatedOscilloscope,
  DialGauge,
  HorizontalBarCluster,
  LiveEventFeed,
  MultiRingGauge,
  PercentileBar,
  StatGrid,
  VerticalMeterBank,
  computeStats,
  useRollingSeries,
} from './dashboards/Widgets';
import {
  ChordDiagram,
  FlameGraph,
  GeoNodeMap,
  HeatmapMatrix,
  RadialBarChart,
  SankeyFlow,
  ScatterPlot,
  StreamGraph,
  TreemapTiles,
  type FlameNode,
  type GeoArc,
  type GeoSite,
  type SankeyFlowLink,
  type SankeyStage,
} from './dashboards/AdvancedWidgets';

interface HudDashboardProps {
  activeTheme: ThemeId;
}

/* ---------------- Static visualisation datasets ---------------- */

const HEATMAP_ROWS = ['ctrl-01', 'ctrl-02', 'edge-a-01', 'edge-a-02', 'edge-b-01', 'gpu-01', 'gpu-02', 'storage-01'];
const HEATMAP_COLS = ['nvme0', 'nvme1', 'nvme2', 'nvme3', 'rbd-0', 'rbd-1', 'zfs-0', 'lh-0'];
const HEATMAP_CELLS = HEATMAP_ROWS.map((_, r) =>
  HEATMAP_COLS.map((_, c) => {
    /* tilt towards "warmer" right side / lower rows */
    const base = (c / HEATMAP_COLS.length) * 0.55 + (r / HEATMAP_ROWS.length) * 0.25;
    const noise = Math.sin(r * 1.3 + c * 0.9) * 0.18 + Math.cos(r * 0.7 - c * 1.4) * 0.12;
    return Math.max(0, Math.min(1, base + 0.18 + noise));
  }),
);

const CHORD_GROUPS = [
  { label: 'API', color: 'var(--theme-accent)' },
  { label: 'Mesh', color: 'var(--theme-accent-2)' },
  { label: 'CSI', color: 'var(--theme-good)' },
  { label: 'GPU', color: 'var(--theme-warn)' },
  { label: 'Edge', color: 'var(--theme-danger)' },
  { label: 'GitOps', color: 'var(--theme-accent)' },
];

const CHORD_LINKS = [
  { source: 0, target: 1, value: 18 },
  { source: 1, target: 2, value: 24 },
  { source: 2, target: 3, value: 16 },
  { source: 3, target: 0, value: 12 },
  { source: 0, target: 4, value: 22 },
  { source: 4, target: 1, value: 19 },
  { source: 5, target: 0, value: 14 },
  { source: 5, target: 2, value: 11 },
  { source: 1, target: 4, value: 9 },
  { source: 3, target: 4, value: 7 },
  { source: 2, target: 5, value: 8 },
];

const SANKEY_STAGES: SankeyStage[] = [
  {
    label: 'INGRESS',
    bands: [
      { id: 'in-public', label: 'public lb', value: 42, color: 'var(--theme-accent)' },
      { id: 'in-vpn', label: 'site vpn', value: 18, color: 'var(--theme-accent-2)' },
      { id: 'in-mgmt', label: 'mgmt api', value: 12, color: 'var(--theme-good)' },
    ],
  },
  {
    label: 'COMPUTE',
    bands: [
      { id: 'cp-vm', label: 'kubevirt', value: 28, color: 'var(--theme-accent)' },
      { id: 'cp-lxc', label: 'lxc/incus', value: 22, color: 'var(--theme-accent-2)' },
      { id: 'cp-pods', label: 'k8s pods', value: 18, color: 'var(--theme-good)' },
      { id: 'cp-gpu', label: 'gpu accel', value: 4, color: 'var(--theme-warn)' },
    ],
  },
  {
    label: 'STORAGE',
    bands: [
      { id: 'st-ceph', label: 'ceph rbd', value: 32, color: 'var(--theme-accent)' },
      { id: 'st-longh', label: 'longhorn', value: 18, color: 'var(--theme-accent-2)' },
      { id: 'st-nvme', label: 'nvme-of', value: 14, color: 'var(--theme-good)' },
      { id: 'st-zfs', label: 'zfs', value: 8, color: 'var(--theme-warn)' },
    ],
  },
];

const SANKEY_LINKS: SankeyFlowLink[] = [
  { from: 'in-public', to: 'cp-vm', value: 22 },
  { from: 'in-public', to: 'cp-lxc', value: 14 },
  { from: 'in-public', to: 'cp-pods', value: 6 },
  { from: 'in-vpn', to: 'cp-lxc', value: 8 },
  { from: 'in-vpn', to: 'cp-pods', value: 10 },
  { from: 'in-mgmt', to: 'cp-vm', value: 6 },
  { from: 'in-mgmt', to: 'cp-gpu', value: 4 },
  { from: 'in-mgmt', to: 'cp-pods', value: 2 },
  { from: 'cp-vm', to: 'st-ceph', value: 18 },
  { from: 'cp-vm', to: 'st-longh', value: 8 },
  { from: 'cp-vm', to: 'st-nvme', value: 2 },
  { from: 'cp-lxc', to: 'st-ceph', value: 8 },
  { from: 'cp-lxc', to: 'st-zfs', value: 8 },
  { from: 'cp-lxc', to: 'st-longh', value: 6 },
  { from: 'cp-pods', to: 'st-longh', value: 4 },
  { from: 'cp-pods', to: 'st-ceph', value: 6 },
  { from: 'cp-pods', to: 'st-nvme', value: 8 },
  { from: 'cp-gpu', to: 'st-nvme', value: 4 },
];

const GEO_SITES: GeoSite[] = [
  { id: 'sea', name: 'sea-1', x: 14, y: 28, status: 'primary', workloads: 142 },
  { id: 'fra', name: 'fra-2', x: 50, y: 26, status: 'primary', workloads: 168 },
  { id: 'sgp', name: 'sgp-3', x: 76, y: 44, status: 'edge', workloads: 84 },
  { id: 'tok', name: 'tok-1', x: 84, y: 28, status: 'edge', workloads: 76 },
  { id: 'sao', name: 'sao-4', x: 28, y: 60, status: 'failover', workloads: 38 },
  { id: 'syd', name: 'syd-2', x: 84, y: 62, status: 'edge', workloads: 52 },
  { id: 'nyc', name: 'nyc-1', x: 26, y: 30, status: 'primary', workloads: 154 },
  { id: 'cpe', name: 'cpe-1', x: 54, y: 56, status: 'degraded', workloads: 12 },
];

const GEO_ARCS: GeoArc[] = [
  { from: 'sea', to: 'nyc', latency: 78, channel: 'mgmt' },
  { from: 'nyc', to: 'fra', latency: 92, channel: 'storage' },
  { from: 'fra', to: 'tok', latency: 168, channel: 'mesh' },
  { from: 'fra', to: 'sgp', latency: 142, channel: 'vm' },
  { from: 'tok', to: 'syd', latency: 122, channel: 'storage' },
  { from: 'sgp', to: 'syd', latency: 96, channel: 'gitops' },
  { from: 'nyc', to: 'sao', latency: 118, channel: 'mesh' },
  { from: 'fra', to: 'cpe', latency: 188, channel: 'mgmt' },
  { from: 'sea', to: 'tok', latency: 134, channel: 'gitops' },
];

const TREEMAP_ITEMS = [
  { label: 'payments', value: 12_400, sub: 'ns/payments · 38 wl', status: 'good' as const },
  { label: 'platform', value: 9_800, sub: 'ns/platform · 56 wl', status: 'good' as const },
  { label: 'analytics', value: 7_200, sub: 'ns/analytics · 24 wl', status: 'warn' as const },
  { label: 'ml-training', value: 5_400, sub: 'ns/ml · 14 gpu', status: 'warn' as const },
  { label: 'edge-cdn', value: 3_900, sub: 'ns/edge · 22 wl' },
  { label: 'security', value: 2_600, sub: 'ns/sec · 16 wl', status: 'good' as const },
  { label: 'observability', value: 2_100, sub: 'ns/obs · 12 wl' },
  { label: 'sandbox', value: 1_400, sub: 'ns/sandbox · 30 wl', status: 'danger' as const },
  { label: 'backups', value: 900, sub: 'ns/backup · 6 wl', status: 'good' as const },
  { label: 'gitops', value: 540, sub: 'ns/argocd · 4 wl' },
];

const FLAME_ROOT: FlameNode = {
  name: 'api.payments.charge',
  value: 4200,
  status: 'warn',
  children: [
    {
      name: 'auth.verify',
      value: 410,
      status: 'good',
      children: [
        { name: 'jwt.parse', value: 180, status: 'good' },
        { name: 'token.lookup', value: 230, status: 'good' },
      ],
    },
    {
      name: 'risk.score',
      value: 1080,
      status: 'warn',
      children: [
        { name: 'rules.eval', value: 320, status: 'good' },
        { name: 'ml.inference', value: 510, status: 'warn' },
        { name: 'fraud.lookup', value: 250, status: 'good' },
      ],
    },
    {
      name: 'ledger.write',
      value: 1280,
      status: 'warn',
      children: [
        { name: 'pg.tx.begin', value: 90 },
        { name: 'pg.insert.ledger', value: 460, status: 'warn' },
        { name: 'pg.update.balance', value: 540, status: 'danger' },
        { name: 'pg.tx.commit', value: 190 },
      ],
    },
    {
      name: 'notify.queue',
      value: 480,
      status: 'good',
      children: [
        { name: 'kafka.publish', value: 230 },
        { name: 'redis.set', value: 250 },
      ],
    },
    { name: 'audit.write', value: 320 },
    { name: 'http.respond', value: 240, status: 'good' },
    { name: 'metrics.emit', value: 110 },
  ],
};

const SCATTER_POINTS = [
  { id: 'svc-1', x: 32, y: 42, label: 'api/auth', status: 'good' as const, size: 1.4 },
  { id: 'svc-2', x: 68, y: 52, label: 'api/payments', status: 'warn' as const, size: 1.8 },
  { id: 'svc-3', x: 22, y: 28, label: 'api/profile', status: 'good' as const, size: 1.1 },
  { id: 'svc-4', x: 84, y: 78, label: 'api/risk', status: 'danger' as const, size: 1.6 },
  { id: 'svc-5', x: 48, y: 36, label: 'api/feed', status: 'good' as const, size: 1.3 },
  { id: 'svc-6', x: 58, y: 62, label: 'api/orders', status: 'warn' as const, size: 1.5 },
  { id: 'svc-7', x: 12, y: 18, label: 'static/cdn', status: 'good' as const, size: 0.9 },
  { id: 'svc-8', x: 72, y: 44, label: 'api/notify', status: 'good' as const, size: 1.2 },
  { id: 'svc-9', x: 36, y: 70, label: 'api/billing', status: 'warn' as const, size: 1.3 },
  { id: 'svc-10', x: 90, y: 90, label: 'api/ml-batch', status: 'danger' as const, size: 1.9 },
  { id: 'svc-11', x: 28, y: 50, label: 'api/inventory', status: 'good' as const, size: 1.1 },
  { id: 'svc-12', x: 52, y: 88, label: 'api/legacy', status: 'danger' as const, size: 1.4 },
];

const RADIAL_BARS = [
  { label: 'KubeVirt VMs', value: 86 },
  { label: 'Incus / LXC', value: 72 },
  { label: 'K8s pods', value: 91 },
  { label: 'System ctr', value: 64 },
  { label: 'GPU jobs', value: 48 },
  { label: 'Backups', value: 38 },
  { label: 'Builds', value: 56 },
  { label: 'Edge sync', value: 78 },
];

const PCTILE_BARS = [
  { label: 'api / charge', p50: 24, p95: 88, p99: 162 },
  { label: 'api / profile', p50: 12, p95: 38, p99: 74 },
  { label: 'csi / write', p50: 18, p95: 64, p99: 132 },
  { label: 'mesh / east-west', p50: 9, p95: 22, p99: 51 },
];

/* ---------------- Component ---------------- */

export function HudDashboard({ activeTheme }: HudDashboardProps) {
  const telemetry = useLiveTelemetry(1600);
  const themeDef = getTheme(activeTheme);

  const cpuSeries = useRollingSeries(telemetry.cpuPercent, 56, telemetry.tick);
  const ramSeries = useRollingSeries(telemetry.ramPercent, 56, telemetry.tick);
  const ingressSeries = useRollingSeries(telemetry.ingressMbps / 1100, 56, telemetry.tick);
  const egressSeries = useRollingSeries(telemetry.egressMbps / 1100, 56, telemetry.tick);
  const wattsSeries = useRollingSeries(telemetry.watts / 30, 56, telemetry.tick);

  const cpuStats = useMemo(() => computeStats(cpuSeries), [cpuSeries]);
  const ramStats = useMemo(() => computeStats(ramSeries), [ramSeries]);

  /* Stream graph: 4 channels of synthetic traffic that breathe with telemetry */
  const streamSeries = useMemo(() => {
    const len = 48;
    const seed = telemetry.tick;
    const channels = ['mgmt', 'storage', 'mesh', 'gpu'];
    const baseVals = [telemetry.ingressMbps / 1200, telemetry.totalIops / 16000, telemetry.egressMbps / 1300, telemetry.activeMigrations * 18 + 12];
    const colors = ['var(--theme-accent)', 'var(--theme-good)', 'var(--theme-accent-2)', 'var(--theme-warn)'];
    return channels.map((label, idx) => ({
      label,
      color: colors[idx],
      values: Array.from({ length: len }, (_, i) => {
        const wave = Math.sin((seed + i * 0.6 + idx * 1.7) / 2.8) * 0.4 + Math.sin((seed + i * 0.9 + idx * 0.4) / 4.2) * 0.3 + 0.55;
        return Math.max(4, baseVals[idx] * wave + (Math.sin(i * 0.6 + idx) * 6));
      }),
    }));
  }, [telemetry.tick, telemetry.cpuPercent, telemetry.ingressMbps, telemetry.egressMbps, telemetry.totalIops, telemetry.activeMigrations]);

  const podsRunning = Math.round(telemetry.totalWorkloads * 0.62);
  const vmsRunning = Math.round(telemetry.totalWorkloads * 0.24);
  const lxcRunning = Math.max(0, telemetry.totalWorkloads - podsRunning - vmsRunning);
  const totalCores = 768;
  const totalRamGb = 6_144;
  const totalCapacityTb = 384;
  const timestamp = useMemo(
    () => new Date().toLocaleTimeString('en-GB', { hour12: false }),
    [telemetry.tick],
  );

  const heroKpis = useMemo(() => [
    { label: 'Compute', value: `${telemetry.cpuPercent.toFixed(0)}%`, hint: `${totalCores} cores`, status: telemetry.cpuPercent > 92 ? 'danger' as const : telemetry.cpuPercent > 80 ? 'warn' as const : undefined },
    { label: 'DRAM', value: `${telemetry.ramPercent.toFixed(0)}%`, hint: `${totalRamGb} GiB`, status: telemetry.ramPercent > 80 ? 'warn' as const : undefined },
    { label: 'Storage IO', value: `${(telemetry.totalIops / 1000).toFixed(1)}k`, hint: `IOPS · ${totalCapacityTb}TB`, status: undefined },
    { label: 'Migrations', value: telemetry.activeMigrations.toString(), hint: `${podsRunning} pods · ${vmsRunning} VMs`, status: telemetry.activeMigrations > 6 ? 'warn' as const : undefined },
  ], [telemetry, podsRunning, vmsRunning]);

  const ringSet = useMemo(() => [
    { label: 'CPU', value: telemetry.cpuPercent, color: 'accent' as const },
    { label: 'DRAM', value: telemetry.ramPercent, color: 'accent-2' as const },
    { label: 'IOPS sat.', value: Math.min(100, (telemetry.totalIops / 1_600_000) * 100), color: 'good' as const },
    { label: 'NET ingress', value: Math.min(100, (telemetry.ingressMbps / 110_000) * 100), color: 'warn' as const },
    { label: 'NET egress', value: Math.min(100, (telemetry.egressMbps / 110_000) * 100), color: 'danger' as const },
  ], [telemetry]);

  const dialBands = [
    { from: 0, to: 60, color: 'var(--theme-good)' },
    { from: 60, to: 85, color: 'var(--theme-warn)' },
    { from: 85, to: 100, color: 'var(--theme-danger)' },
  ];

  const horizBars = useMemo(() => ([
    { label: 'pg-payments', value: 14820, unit: ' IOPS', delta: 240, detail: 'rbd-0 · p99 132µs', status: 'good' as const },
    { label: 'redis-mesh', value: 12640, unit: ' IOPS', delta: -82, detail: 'longhorn · p99 88µs' },
    { label: 'kafka-stream', value: 9840, unit: ' IOPS', delta: 412, detail: 'nvme-of · p99 64µs', status: 'good' as const },
    { label: 'minio-cdn', value: 7320, unit: ' IOPS', delta: -34, detail: 'rbd-1 · p99 154µs', status: 'warn' as const },
    { label: 'pg-billing', value: 5210, unit: ' IOPS', delta: 18, detail: 'zfs-0 · p99 188µs', status: 'warn' as const },
  ]), []);

  const meterBank = useMemo(() => ([
    { label: 'NIC-A', value: Math.min(100, (telemetry.ingressMbps / 60_000) * 100), unit: '%', threshold: 80 },
    { label: 'NIC-B', value: Math.min(100, (telemetry.egressMbps / 60_000) * 100), unit: '%', threshold: 80 },
    { label: 'CSI', value: Math.min(100, (telemetry.totalIops / 1_800_000) * 100), unit: '%', threshold: 85 },
    { label: 'BUS', value: telemetry.cpuPercent, unit: '%', threshold: 80 },
    { label: 'GPU', value: Math.max(30, telemetry.activeMigrations * 11 + 38), unit: '%', threshold: 80 },
    { label: 'PCI', value: telemetry.ramPercent * 0.78 + 12, unit: '%', threshold: 80 },
  ]), [telemetry]);

  const statTiles = useMemo(() => ([
    { label: 'Pods running', value: podsRunning, hint: '+12 / hr', status: 'good' as const, delta: 12 },
    { label: 'VMs running', value: vmsRunning, hint: 'live-migr 3', status: 'good' as const, delta: 2 },
    { label: 'LXC running', value: lxcRunning, hint: 'incus engine' },
    { label: 'GPU jobs', value: telemetry.activeMigrations + 4, hint: 'A100 mdev', status: 'warn' as const, delta: 1 },
    { label: 'Validations', value: 142, hint: 'k8s + crd', delta: -3 },
    { label: 'Mesh hops', value: 18, hint: 'east-west · p95 14ms', status: 'good' as const },
    { label: 'CVE open', value: telemetry.openCves, hint: `trust ${telemetry.trustScore}/100`, status: telemetry.openCves > 0 ? 'warn' as const : 'good' as const, delta: -2 },
    { label: 'RPO', value: '4m', hint: 'pbs-primary' },
  ]), [telemetry, podsRunning, vmsRunning, lxcRunning]);

  return (
    <section className="hud-dashboard hud-v4" aria-label="Nexus HUD command surface v4">
      {/* === HERO === */}
      <header className="hud-v4-hero">
        <div>
          <span className="hero-kicker">NEXUS // HARVESTER COMMAND</span>
          <h2>Live cluster command surface</h2>
          <p>
            Real-time poly-compute telemetry across {totalCores} cores, {totalRamGb} GiB DRAM,
            {' '}{totalCapacityTb} TB storage and {GEO_SITES.length} sites — heatmaps, traffic ribbons,
            geo arcs, traces, treemaps and percentile distributions, all driven by the demo stream.
          </p>
          <span className="hud-kicker" style={{ display: 'inline-block', marginTop: '0.5rem' }}>THEME · {themeDef.name.toUpperCase()}</span>
        </div>
        <div className="hud-v4-hero-kpis">
          {heroKpis.map((kpi) => (
            <div key={kpi.label} className={`hud-v4-hero-kpi ${kpi.status ? `status-${kpi.status}` : ''}`}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small>{kpi.hint}</small>
            </div>
          ))}
        </div>
        <div className="hud-v4-hero-status">
          <div className="hud-v4-hero-status-row">
            <i className="led" />
            <span>Demo stream <b>active</b></span>
          </div>
          <div className="hud-v4-hero-status-row">
            <i className="led" />
            <span>vCluster · <b>edge-a / edge-b</b></span>
          </div>
          <div className="hud-v4-hero-status-row warn">
            <i className="led" />
            <span>1 warning · <b>storage-01 latency</b></span>
          </div>
          <div className="hud-v4-hero-status-row">
            <i className="led" />
            <span>GitOps sync · <b>argocd live</b></span>
          </div>
        </div>
      </header>

      {/* === BANNER === */}
      <div className="hud-v4-banner" role="status">
        <i className="led" />
        <span>Cluster pulse · <b>{Math.round(telemetry.totalIops / 1000)}k IOPS</b></span>
        <span>· Ingress <b>{(telemetry.ingressMbps / 1000).toFixed(1)} Gbps</b></span>
        <span>· Egress <b>{(telemetry.egressMbps / 1000).toFixed(1)} Gbps</b></span>
        <span>· {podsRunning} pods · {vmsRunning} VMs · {lxcRunning} LXC</span>
        <em>{timestamp}</em>
      </div>

      {/* === ROW 1: Geo + Rings + Dials === */}
      <section className="hud-v4-section span-7">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Global topology · live arcs</h3>
          <span className="section-meta"><i />{GEO_SITES.length} sites · {GEO_ARCS.length} routes</span>
        </div>
        <GeoNodeMap sites={GEO_SITES} arcs={GEO_ARCS} height={300} tick={telemetry.tick} />
      </section>

      <section className="hud-v4-section span-5">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Saturation rings · 5-axis pressure</h3>
          <span className="section-meta"><i />live</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <MultiRingGauge
            rings={ringSet}
            centerLabel="Pressure"
            centerValue={`${Math.round((ringSet.reduce((a, r) => a + r.value, 0) / ringSet.length))}%`}
            centerSub="composite"
            size={300}
          />
        </div>
      </section>

      {/* === ROW 2: Sankey + Chord === */}
      <section className="hud-v4-section span-8">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Ingress → Compute → Storage flow</h3>
          <span className="section-meta"><i />{(telemetry.ingressMbps / 1000).toFixed(1)} Gbps · {Math.round(telemetry.totalIops / 1000)}k IOPS</span>
        </div>
        <SankeyFlow stages={SANKEY_STAGES} links={SANKEY_LINKS} height={260} />
      </section>

      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Service mesh chord</h3>
          <span className="section-meta"><i />east-west</span>
        </div>
        <ChordDiagram groups={CHORD_GROUPS} links={CHORD_LINKS} size={280} tick={telemetry.tick} />
      </section>

      {/* === ROW 3: Oscilloscope + FFT === */}
      <section className="hud-v4-section span-7">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Multi-channel oscilloscope · CPU / DRAM / NIC</h3>
          <span className="section-meta"><i />t-9 → t-0 · 1.6 s/div</span>
        </div>
        <AnnotatedOscilloscope
          channels={[
            { label: 'cpu %', series: cpuSeries, unit: '%', color: 'var(--theme-accent)' },
            { label: 'dram %', series: ramSeries, unit: '%', color: 'var(--theme-accent-2)' },
            { label: 'net ingress', series: ingressSeries.map((v) => Math.min(98, v * 100)), unit: 'gbps', color: 'var(--theme-good)' },
            { label: 'net egress', series: egressSeries.map((v) => Math.min(98, v * 100)), unit: 'gbps', color: 'var(--theme-warn)' },
          ]}
          snapshot={telemetry}
          height={250}
        />
      </section>

      <section className="hud-v4-section span-5">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Storage fabric spectrum · FFT</h3>
          <span className="section-meta"><i />bw 200 MHz · sample 62.5 ms/pt</span>
        </div>
        <AnnotatedFft snapshot={telemetry} bars={56} height={250} />
      </section>

      {/* === ROW 4: Heatmap + Radial bar === */}
      <section className="hud-v4-section span-8">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Latency heatmap · node × disk (µs)</h3>
          <span className="section-meta"><i />{HEATMAP_ROWS.length} × {HEATMAP_COLS.length} matrix</span>
        </div>
        <HeatmapMatrix
          rows={HEATMAP_ROWS}
          cols={HEATMAP_COLS}
          cells={HEATMAP_CELLS}
          format={(v) => `${Math.round(40 + v * 220)}µs`}
        />
      </section>

      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Workload polar mix</h3>
          <span className="section-meta"><i />by engine</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RadialBarChart bars={RADIAL_BARS} size={280} innerLabel="ENGINES" innerValue={`${RADIAL_BARS.length}`} />
        </div>
      </section>

      {/* === ROW 5: Treemap + Scatter + Stream === */}
      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Resource treemap · vCPU min · 5 min</h3>
          <span className="section-meta"><i />by namespace</span>
        </div>
        <TreemapTiles items={TREEMAP_ITEMS} height={230} />
      </section>

      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Latency · throughput scatter</h3>
          <span className="section-meta"><i />top-right = unhealthy</span>
        </div>
        <ScatterPlot
          points={SCATTER_POINTS}
          xLabel="THROUGHPUT (k rps)"
          yLabel="P99 LATENCY (ms)"
          xMax={100}
          yMax={100}
          height={240}
          threshold={{ axis: 'y', value: 60, label: 'p99 SLO 60ms' }}
        />
      </section>

      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Channel stream · 4-track</h3>
          <span className="section-meta"><i />mgmt · storage · mesh · gpu</span>
        </div>
        <StreamGraph series={streamSeries} height={240} />
      </section>

      {/* === ROW 6: Flame graph + dials === */}
      <section className="hud-v4-section span-7">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Trace flame · api.payments.charge</h3>
          <span className="section-meta"><i />4.2ms total · 8 spans · 23 children</span>
        </div>
        <FlameGraph root={FLAME_ROOT} height={230} />
      </section>

      <section className="hud-v4-section span-5">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Dial bank · primary headroom</h3>
          <span className="section-meta"><i />4-axis</span>
        </div>
        <div className="hud-v4-gauge-row">
          <DialGauge value={telemetry.cpuPercent} label="CPU %" unit="%" status={telemetry.cpuPercent > 80 ? 'warn' : 'good'} bands={dialBands} />
          <DialGauge value={telemetry.ramPercent} label="DRAM %" unit="%" status={telemetry.ramPercent > 80 ? 'warn' : 'good'} bands={dialBands} />
          <DialGauge value={Math.min(100, (telemetry.totalIops / 1_600_000) * 100)} label="IOPS sat." unit="%" status="good" bands={dialBands} />
          <DialGauge value={Math.min(100, (telemetry.watts / 3200) * 100)} label="Power" unit="%" status={(telemetry.watts / 3200) > 0.78 ? 'warn' : 'good'} bands={dialBands} />
        </div>
      </section>

      {/* === ROW 7: Percentile + Horizontal bars + meters === */}
      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Latency · P50 · P95 · P99</h3>
          <span className="section-meta"><i />tail watch</span>
        </div>
        <div className="hud-v4-substack">
          {PCTILE_BARS.map((p) => (
            <PercentileBar key={p.label} label={p.label} p50={p.p50} p95={p.p95} p99={p.p99} unit="ms" scale={200} />
          ))}
        </div>
      </section>

      <section className="hud-v4-section span-5">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Top tenants by I/O</h3>
          <span className="section-meta"><i />5-min · IOPS</span>
        </div>
        <HorizontalBarCluster bars={horizBars} />
      </section>

      <section className="hud-v4-section span-3">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Bus meter bank</h3>
          <span className="section-meta"><i />6-channel</span>
        </div>
        <VerticalMeterBank meters={meterBank} height={200} />
      </section>

      {/* === ROW 8: Stat grid + Live feed === */}
      <section className="hud-v4-section span-8">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Operational stat grid · 8-tile</h3>
          <span className="section-meta"><i />MIN {cpuStats.min.toFixed(1)}% · AVG {cpuStats.avg.toFixed(1)}% · MAX {cpuStats.max.toFixed(1)}% · NOW {cpuStats.current.toFixed(1)}% · DRAM MAX {ramStats.max.toFixed(1)}% · WATTS {Math.round(wattsSeries[wattsSeries.length - 1] * 30)}</span>
        </div>
        <StatGrid items={statTiles} columns={4} />
      </section>

      <section className="hud-v4-section span-4">
        <i className="section-corner corner-tl" />
        <i className="section-corner corner-tr" />
        <i className="section-corner corner-bl" />
        <i className="section-corner corner-br" />
        <div className="section-title">
          <h3>Event stream · live</h3>
          <span className="section-meta"><i />tick {telemetry.tick}</span>
        </div>
        <LiveEventFeed snapshot={telemetry} height={240} maxLines={9} />
      </section>
    </section>
  );
}

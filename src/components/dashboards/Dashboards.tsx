import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  buildAccelerationDashboard,
  buildActivityDashboard,
  buildEnvironmentDashboard,
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildOperationsDashboard,
  buildPolyComputeDashboard,
  buildProcessorMemoryDashboard,
  buildStorageDashboard,
  type CpuCore,
} from '../../lib/dashboards';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import type { LiveOperationsSlice } from '../../lib/telemetry/dashboardTypes';
import type { TelemetryDataSource } from '../../lib/telemetry/dashboardAdapters';
import type { MachinesDashboard, StorageDashboard } from '../../lib/dashboards';
import { DemoCatalogPlaceholder, LiveEmptyPanel } from './LiveEmptyPanel';
import { ClusterRadar, ThreatIntelMap, WidgetTitle } from './Widgets';
import {
  ChordDiagram,
  ChordWithStats,
  FlameGraph,
  GeoNodeMap,
  HeatmapMatrix,
  RadialBarChart,
  RichBarRows,
  SankeyFlow,
  ScatterPlot,
  StreamGraph,
  TreemapTiles,
  type ChordTrafficLink,
  type GeoArc,
  type GeoSite,
  type RichBarRow,
  type SankeyFlowLink,
  type SankeyStage,
} from './AdvancedWidgets';

const networking = buildNetworkingDashboard();
const storage = buildStorageDashboard();
const machines = buildMachinesDashboard();
const procmem = buildProcessorMemoryDashboard();
const ops = buildOperationsDashboard();
const poly = buildPolyComputeDashboard();
const accel = buildAccelerationDashboard();
const environment = buildEnvironmentDashboard();
const activity = buildActivityDashboard();

interface DashboardViewProps {
  telemetry?: EnvironmentSnapshot;
  dataSource?: TelemetryDataSource;
  storageDashboard?: StorageDashboard;
  machinesDashboard?: MachinesDashboard;
  operationsLinks?: LiveOperationsSlice;
}

/**
 * Force-remounts a span when the value changes so the CSS flash animation
 * runs again on every tick. Lightweight wrapper used inline by dashboards
 * to render numeric metrics that come from the live telemetry feed.
 */
function LiveValue({ value, className }: { value: string | number; className?: string }) {
  const [tick, setTick] = useState(0);
  const [previous, setPrevious] = useState<string | number>(value);
  useEffect(() => {
    if (value !== previous) {
      setPrevious(value);
      setTick((current) => current + 1);
    }
  }, [value, previous]);
  return (
    <span key={tick} className={`live-tick ${className ?? ''}`.trim()}>
      {value}
    </span>
  );
}

function svgPathBetween(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const mx = ax + dx / 2 + dy * 0.18;
  const my = ay + dy / 2 - dx * 0.18;
  return `M${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

function RouteDecoration() {
  return (
    <svg className="route-decoration" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="route-grad-h" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0" />
          <stop offset="30%" stopColor="var(--theme-accent)" stopOpacity="0.7" />
          <stop offset="70%" stopColor="var(--theme-accent-2)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
        </linearGradient>
        <filter id="route-bloom">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
      </defs>
      <path d="M0 30 Q 60 10, 120 30 T 240 30 T 360 25 L 400 28" fill="none" stroke="url(#route-grad-h)" strokeWidth="1.5" opacity="0.6" />
      <path d="M0 30 Q 60 10, 120 30 T 240 30 T 360 25 L 400 28" fill="none" stroke="url(#route-grad-h)" strokeWidth="3" opacity="0.25" filter="url(#route-bloom)" />
      <path d="M0 45 Q 80 55, 160 40 T 320 42 L 400 38" fill="none" stroke="var(--theme-accent-2)" strokeWidth="0.8" opacity="0.3" strokeDasharray="6 12" />
      <circle cx="120" cy="30" r="2.5" fill="var(--theme-accent)" opacity="0.8">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="240" cy="30" r="2" fill="var(--theme-accent-2)" opacity="0.7">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="360" cy="25" r="1.8" fill="var(--theme-accent)" opacity="0.6">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle r="2" fill="var(--theme-accent)" opacity="0.9">
        <animateMotion dur="6s" repeatCount="indefinite" path="M0 30 Q 60 10, 120 30 T 240 30 T 360 25 L 400 28" />
      </circle>
    </svg>
  );
}

const NETWORKING_GEO_SITES: GeoSite[] = [
  { id: 'sea', name: 'sea-1', x: 14, y: 28, status: 'primary' },
  { id: 'fra', name: 'fra-2', x: 50, y: 26, status: 'primary' },
  { id: 'sgp', name: 'sgp-3', x: 76, y: 44, status: 'edge' },
  { id: 'tok', name: 'tok-1', x: 84, y: 28, status: 'edge' },
  { id: 'syd', name: 'syd-2', x: 84, y: 62, status: 'edge' },
  { id: 'nyc', name: 'nyc-1', x: 26, y: 30, status: 'primary' },
  { id: 'sao', name: 'sao-4', x: 28, y: 60, status: 'failover' },
];

const NETWORKING_GEO_ARCS: GeoArc[] = [
  { from: 'sea', to: 'nyc', latency: 78, channel: 'mgmt' },
  { from: 'nyc', to: 'fra', latency: 92, channel: 'storage' },
  { from: 'fra', to: 'tok', latency: 168, channel: 'mesh' },
  { from: 'fra', to: 'sgp', latency: 142, channel: 'vm' },
  { from: 'tok', to: 'syd', latency: 122, channel: 'storage' },
  { from: 'nyc', to: 'sao', latency: 118, channel: 'mesh' },
  { from: 'sea', to: 'tok', latency: 134, channel: 'gitops' },
];

const VLAN_CHORD_GROUPS = [
  { label: 'mgmt', color: 'var(--theme-accent)' },
  { label: 'storage', color: 'var(--theme-good)' },
  { label: 'mesh', color: 'var(--theme-accent-2)' },
  { label: 'vm-net', color: 'var(--theme-warn)' },
  { label: 'gitops', color: 'var(--theme-accent)' },
  { label: 'edge-dmz', color: 'var(--theme-danger)' },
];

const VLAN_CHORD_LINKS: ChordTrafficLink[] = [
  { source: 0, target: 2, value: 18, rate: '482 Mb/s', label: 'mgmt → mesh' },
  { source: 0, target: 4, value: 12, rate: '328 Mb/s', label: 'mgmt → gitops' },
  { source: 1, target: 2, value: 22, rate: '1.18 Gb/s', label: 'storage → mesh' },
  { source: 1, target: 3, value: 16, rate: '742 Mb/s', label: 'storage → vm-net' },
  { source: 2, target: 3, value: 28, rate: '1.42 Gb/s', label: 'mesh → vm-net' },
  { source: 2, target: 5, value: 14, rate: '364 Mb/s', label: 'mesh → edge-dmz' },
  { source: 3, target: 5, value: 18, rate: '612 Mb/s', label: 'vm-net → edge-dmz' },
  { source: 4, target: 0, value: 10, rate: '184 Mb/s', label: 'gitops → mgmt' },
  { source: 4, target: 2, value: 14, rate: '280 Mb/s', label: 'gitops → mesh' },
  { source: 5, target: 0, value: 11, rate: '212 Mb/s', label: 'edge-dmz → mgmt' },
];

export function NetworkingDashboardView({ telemetry, dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Networking & Service Mesh" dataSource={dataSource} />;
  }
  const { topology, vlans, ingressRoutes, policyMatrix, nicBonds, vip } = networking;
  const liveBonds = useMemo(() => {
    if (!telemetry) return nicBonds;
    const ingressFactor = telemetry.ingressMbps / 78_420;
    const egressFactor = telemetry.egressMbps / 74_840;
    return nicBonds.map((bond) => ({
      ...bond,
      rxMbps: Math.round(bond.rxMbps * ingressFactor),
      txMbps: Math.round(bond.txMbps * egressFactor),
    }));
  }, [telemetry]);
  const nodeMap = new Map(topology.nodes.map((node) => [node.id, node]));
  const sources = Array.from(new Set(policyMatrix.map((cell) => cell.source)));
  const targets = Array.from(new Set(policyMatrix.map((cell) => cell.target)));

  /* 4-track flow over the past N ticks; faked but tied to live ingress/egress. */
  const trafficStream = useMemo(() => {
    const len = 40;
    const seed = telemetry?.tick ?? 0;
    const base = telemetry ? telemetry.ingressMbps / 1500 : 50;
    return [
      { label: 'mgmt', color: 'var(--theme-accent)', values: Array.from({ length: len }, (_, i) => Math.max(4, base * 0.4 + Math.sin((seed + i) / 4) * 12 + 18)) },
      { label: 'storage', color: 'var(--theme-good)', values: Array.from({ length: len }, (_, i) => Math.max(4, base * 0.8 + Math.sin((seed + i) / 3.2 + 1.4) * 18 + 26)) },
      { label: 'mesh', color: 'var(--theme-accent-2)', values: Array.from({ length: len }, (_, i) => Math.max(4, base * 0.6 + Math.cos((seed + i) / 5 + 0.8) * 14 + 22)) },
      { label: 'vm-net', color: 'var(--theme-warn)', values: Array.from({ length: len }, (_, i) => Math.max(4, base * 0.3 + Math.sin((seed + i) / 2.7 + 2.1) * 10 + 16)) },
    ];
  }, [telemetry?.tick, telemetry?.ingressMbps]);

  return (
    <section className="dash dash-networking" aria-label="Networking dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CHANNEL // NETWORK</span>
          <h2>{networking.title}</h2>
          <p>Geo-traffic globe, vector route topology, ingress mesh, VLAN lanes, NIC bonds, and policy fabric.</p>
        </div>
        <div className="dash-vip">
          <span>VIP</span>
          <strong>{vip.address}</strong>
          <small>{vip.mode} · {vip.floating ? 'floating' : 'pinned'}</small>
        </div>
      </header>

      <article className="dash-panel threat-intel-panel">
        <WidgetTitle
          kicker="MDR // XDR · GEO-INTEL"
          title="World threat intelligence · live"
          trailing={<span className="osc-readout">Frankfurt VIP · {networking.vip.address}</span>}
        />
        <ThreatIntelMap snapshot={telemetry} height={560} />
      </article>

      <article className="dash-panel cluster-radar-panel">
        <WidgetTitle
          kicker="CLUSTER · SONAR"
          title="Cluster radar · live tier roll-up"
          trailing={<span className="osc-readout">{topology.nodes.length}+ nodes · {topology.edges.length} routes · 5 tiers</span>}
        />
        <ClusterRadar snapshot={telemetry} height={460} />
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>Global site routes · live arcs</span>
            <strong>{NETWORKING_GEO_SITES.length} sites · {NETWORKING_GEO_ARCS.length} routes</strong>
          </div>
          <GeoNodeMap sites={NETWORKING_GEO_SITES} arcs={NETWORKING_GEO_ARCS} height={260} tick={telemetry?.tick ?? 0} />
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>VLAN chord · live inter-fabric traffic</span>
            <strong>{VLAN_CHORD_GROUPS.length} channels · {VLAN_CHORD_LINKS.length} flows</strong>
          </div>
          <ChordWithStats
            groups={VLAN_CHORD_GROUPS}
            links={VLAN_CHORD_LINKS}
            size={240}
            tick={telemetry?.tick ?? 0}
            summary={[
              { label: 'east-west bw', value: `${((telemetry?.ingressMbps ?? 78_000) / 14).toFixed(0)} Mb/s`, tone: 'good' },
              { label: 'east-west p95', value: '14ms', tone: 'good' },
              { label: 'top vlan', value: 'mesh → vm-net 1.42Gb/s' },
              { label: 'denied', value: '12 / 5min', tone: 'warn' },
            ]}
          />
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title">
          <span>Channel stream · 4-track ingress mix</span>
          <strong>mgmt · storage · mesh · vm-net</strong>
        </div>
        <StreamGraph series={trafficStream} height={180} />
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>VLAN / bond lanes</span>
            <strong>{vlans.length} VLANs</strong>
          </div>
          <ul className="vlan-list">
            {vlans.map((vlan) => (
              <li key={vlan.id}>
                <div>
                  <span className="vlan-id">VLAN {vlan.vlanId}</span>
                  <strong>{vlan.name}</strong>
                  <small>{vlan.cidr}</small>
                </div>
                <div className="vlan-meter">
                  <div className="meter-row">
                    <span>RX</span>
                    <i style={{ width: `${Math.min(100, vlan.ingressMbps / 100)}%` }} />
                    <b>{vlan.ingressMbps} Mb/s</b>
                  </div>
                  <div className="meter-row">
                    <span>TX</span>
                    <i style={{ width: `${Math.min(100, vlan.egressMbps / 100)}%` }} />
                    <b>{vlan.egressMbps} Mb/s</b>
                  </div>
                </div>
                <div className="vlan-counts">
                  <span>{vlan.pods} pods</span>
                  <span>{vlan.vms} vms</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>Service-mesh ingress routes</span>
            <strong>{ingressRoutes.length} routes</strong>
          </div>
          <table className="dash-table">
            <thead>
              <tr><th>host</th><th>service</th><th>mesh</th><th>tls</th><th>rps</th><th>p95</th></tr>
            </thead>
            <tbody>
              {ingressRoutes.map((route) => (
                <tr key={route.id}>
                  <td><strong>{route.host}</strong></td>
                  <td>{route.service}</td>
                  <td><span className={`mesh-chip mesh-${route.meshProvider}`}>{route.meshProvider}</span></td>
                  <td><span className={`tls-chip tls-${route.tls}`}>{route.tls}</span></td>
                  <td><b>{route.rps}</b></td>
                  <td>{route.p95Latency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>NIC bonds</span>
            <strong>{nicBonds.length} bonds</strong>
          </div>
          <ul className="nic-list">
            {liveBonds.map((bond) => (
              <li key={bond.name} className={`nic-state-${bond.state}`}>
                <div>
                  <strong>{bond.name}</strong>
                  <small>{bond.speedGbps} Gbps · {bond.state}</small>
                </div>
                <div className="nic-flow">
                  <span>RX <LiveValue value={`${bond.rxMbps.toLocaleString()} Mb/s`} /></span>
                  <span>TX <LiveValue value={`${bond.txMbps.toLocaleString()} Mb/s`} /></span>
                </div>
                <div className="nic-bars">
                  <i style={{ width: `${Math.min(100, bond.rxMbps / (bond.speedGbps * 1000) * 100)}%` }} />
                  <i style={{ width: `${Math.min(100, bond.txMbps / (bond.speedGbps * 1000) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>NetworkPolicy matrix</span>
            <strong>{policyMatrix.filter((cell) => cell.allow).length} allow · {policyMatrix.filter((cell) => !cell.allow).length} deny</strong>
          </div>
          <div className="policy-grid" style={{ gridTemplateColumns: `auto repeat(${targets.length}, 1fr)` }}>
            <span />
            {targets.map((target) => <span key={target} className="policy-col">{target}</span>)}
            {sources.map((source) => (
              <Fragment key={`row-${source}`}>
                <span className="policy-row">{source}</span>
                {targets.map((target) => {
                  const cell = policyMatrix.find((entry) => entry.source === source && entry.target === target);
                  if (!cell || source === target) return <span key={`${source}-${target}`} className="policy-cell policy-na" />;
                  return (
                    <span key={`${source}-${target}`} className={`policy-cell policy-${cell.allow ? 'allow' : 'deny'}`} title={`${source} -> ${target} ${cell.allow ? 'allow' : 'deny'} ${cell.protocol}`}>
                      {cell.allow ? '+' : '-'}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

const STORAGE_SANKEY_STAGES: SankeyStage[] = [
  {
    label: 'WORKLOADS',
    bands: [
      { id: 'wl-vm', label: 'kubevirt vm', value: 32, color: 'var(--theme-accent)' },
      { id: 'wl-pod', label: 'k8s pods', value: 28, color: 'var(--theme-accent-2)' },
      { id: 'wl-lxc', label: 'lxc / incus', value: 18, color: 'var(--theme-good)' },
      { id: 'wl-gpu', label: 'gpu jobs', value: 6, color: 'var(--theme-warn)' },
    ],
  },
  {
    label: 'CSI CLASS',
    bands: [
      { id: 'sc-rwo', label: 'rwo block', value: 38, color: 'var(--theme-accent)' },
      { id: 'sc-rwx', label: 'rwx file', value: 20, color: 'var(--theme-accent-2)' },
      { id: 'sc-fast', label: 'fast-nvme', value: 18, color: 'var(--theme-good)' },
      { id: 'sc-arch', label: 'archive', value: 8, color: 'var(--theme-warn)' },
    ],
  },
  {
    label: 'BACKEND',
    bands: [
      { id: 'be-ceph', label: 'ceph', value: 36, color: 'var(--theme-accent)' },
      { id: 'be-long', label: 'longhorn', value: 22, color: 'var(--theme-accent-2)' },
      { id: 'be-nvme', label: 'nvme-of', value: 16, color: 'var(--theme-good)' },
      { id: 'be-zfs', label: 'zfs', value: 8, color: 'var(--theme-warn)' },
      { id: 'be-nfs', label: 'nfs/smb', value: 2, color: 'var(--theme-danger)' },
    ],
  },
];

const STORAGE_SANKEY_LINKS: SankeyFlowLink[] = [
  { from: 'wl-vm', to: 'sc-rwo', value: 20 },
  { from: 'wl-vm', to: 'sc-fast', value: 8 },
  { from: 'wl-vm', to: 'sc-arch', value: 4 },
  { from: 'wl-pod', to: 'sc-rwo', value: 12 },
  { from: 'wl-pod', to: 'sc-rwx', value: 12 },
  { from: 'wl-pod', to: 'sc-fast', value: 4 },
  { from: 'wl-lxc', to: 'sc-rwo', value: 6 },
  { from: 'wl-lxc', to: 'sc-rwx', value: 8 },
  { from: 'wl-lxc', to: 'sc-arch', value: 4 },
  { from: 'wl-gpu', to: 'sc-fast', value: 6 },
  { from: 'sc-rwo', to: 'be-ceph', value: 22 },
  { from: 'sc-rwo', to: 'be-long', value: 14 },
  { from: 'sc-rwo', to: 'be-zfs', value: 2 },
  { from: 'sc-rwx', to: 'be-long', value: 8 },
  { from: 'sc-rwx', to: 'be-nfs', value: 2 },
  { from: 'sc-rwx', to: 'be-ceph', value: 10 },
  { from: 'sc-fast', to: 'be-nvme', value: 14 },
  { from: 'sc-fast', to: 'be-ceph', value: 4 },
  { from: 'sc-arch', to: 'be-zfs', value: 6 },
  { from: 'sc-arch', to: 'be-ceph', value: 2 },
];

const STORAGE_TREEMAP = [
  { label: 'payments', value: 8600, sub: 'pvc / 18 vol', status: 'good' as const },
  { label: 'ml-train', value: 6200, sub: 'pvc / 12 vol', status: 'warn' as const },
  { label: 'analytics', value: 4400, sub: 'pvc / 22 vol' },
  { label: 'platform', value: 3300, sub: 'pvc / 38 vol', status: 'good' as const },
  { label: 'cdn', value: 2400, sub: 'pvc / 14 vol' },
  { label: 'backups', value: 1700, sub: 'pvc / 8 vol', status: 'good' as const },
  { label: 'observ', value: 1200, sub: 'pvc / 10 vol' },
  { label: 'security', value: 700, sub: 'pvc / 6 vol' },
];

const STORAGE_SCATTER = [
  { id: 's-1', x: 32, y: 18, label: 'ceph-rbd-0', status: 'good' as const, size: 1.6 },
  { id: 's-2', x: 28, y: 22, label: 'ceph-rbd-1', status: 'good' as const, size: 1.4 },
  { id: 's-3', x: 68, y: 42, label: 'longhorn-0', status: 'warn' as const, size: 1.5 },
  { id: 's-4', x: 82, y: 24, label: 'nvme-of-0', status: 'good' as const, size: 1.8 },
  { id: 's-5', x: 22, y: 64, label: 'zfs-cold', status: 'warn' as const, size: 1.1 },
  { id: 's-6', x: 12, y: 86, label: 'nfs-legacy', status: 'danger' as const, size: 0.9 },
  { id: 's-7', x: 56, y: 14, label: 'ceph-rbd-2', status: 'good' as const, size: 1.7 },
  { id: 's-8', x: 74, y: 58, label: 'longhorn-1', status: 'warn' as const, size: 1.4 },
];

export function StorageDashboardView({ telemetry, dataSource, storageDashboard }: DashboardViewProps = {}) {
  const storageData = storageDashboard ?? storage;
  const { backends, pvcs, snapshots, replicationLinks } = storageData;
  const isLive = dataSource === 'live';
  const liveBackends = useMemo(() => {
    if (isLive || !telemetry) return backends;
    const iopsFactor = telemetry.totalIops / 1_120_000;
    return backends.map((backend) => ({
      ...backend,
      iops: Math.round(backend.iops * iopsFactor),
    }));
  }, [telemetry]);
  return (
    <section className="dash dash-storage" aria-label="Storage dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">FABRIC // STORAGE</span>
          <h2>{storageData.title}</h2>
          <p>{isLive ? 'User PVCs and storage classes with bound volumes from your cluster.' : 'Per-backend radial gauges, IOPS sparklines, PVC lanes, snapshot shelves, replication links.'}</p>
        </div>
        <div className="dash-totals">
          <div><span>Capacity</span><strong>{isLive ? '—' : `${backends.reduce((sum, b) => sum + b.capacityTiB, 0)} TiB`}</strong></div>
          <div><span>IOPS</span><strong><LiveValue value={isLive ? (telemetry?.totalIops?.toLocaleString() ?? '0') : `${(liveBackends.reduce((sum, b) => sum + b.iops, 0) / 1000).toFixed(1)} K`} /></strong></div>
        </div>
      </header>

      {!isLive && (
      <>
      <article className="dash-panel">
        <div className="panel-title">
          <span>Storage flow · workloads → CSI class → backend</span>
          <strong>{(liveBackends.reduce((sum, b) => sum + b.iops, 0) / 1000).toFixed(1)}k IOPS</strong>
        </div>
        <SankeyFlow stages={STORAGE_SANKEY_STAGES} links={STORAGE_SANKEY_LINKS} height={260} />
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>Capacity treemap · GiB by namespace</span>
            <strong>{STORAGE_TREEMAP.reduce((a, t) => a + t.value, 0).toLocaleString()} GiB</strong>
          </div>
          <TreemapTiles items={STORAGE_TREEMAP} height={220} />
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>Latency · throughput · per-volume</span>
            <strong>top-right = unhealthy</strong>
          </div>
          <ScatterPlot
            points={STORAGE_SCATTER}
            xLabel="THROUGHPUT (k IOPS)"
            yLabel="P99 LATENCY (ms)"
            xMax={100}
            yMax={100}
            height={240}
            threshold={{ axis: 'y', value: 60, label: 'p99 SLO 60ms' }}
          />
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title">
          <span>Top volumes · stacked I/O + sparkline</span>
          <strong>read · write · queue depth</strong>
        </div>
        <RichBarRows
          rows={(() => {
            const seed = telemetry?.tick ?? 0;
            const buildSpark = (offset: number, base: number) =>
              Array.from({ length: 24 }, (_, i) => Math.max(2, base + Math.sin((seed + i + offset) / 2.4) * (base * 0.18) + Math.sin((seed + i + offset) / 1.2) * (base * 0.08)));
            return [
              { label: 'pvc-payments-pri', segments: [{ value: 9_400, label: 'reads' }, { value: 5_420, label: 'writes' }, { value: 320, label: 'queue' }], spark: buildSpark(0, 14_000), total: 15_140, unit: ' IOPS', delta: 240, badges: [{ text: 'rbd', tone: 'good' }, { text: 'p99 132µs', tone: 'good' }, { text: 'rwo' }, { text: '128 GiB' }] },
              { label: 'pvc-redis-cache', segments: [{ value: 8_200, label: 'reads' }, { value: 4_440, label: 'writes' }], spark: buildSpark(3, 12_000), total: 12_640, unit: ' IOPS', delta: -82, badges: [{ text: 'longhorn' }, { text: 'p99 88µs', tone: 'good' }, { text: 'rwo' }, { text: '64 GiB' }] },
              { label: 'pvc-kafka-broker', segments: [{ value: 6_300, label: 'produce' }, { value: 3_540, label: 'consume' }], spark: buildSpark(6, 9_500), total: 9_840, unit: ' IOPS', delta: 412, badges: [{ text: 'nvme-of', tone: 'good' }, { text: 'p99 64µs', tone: 'good' }, { text: 'rwo' }, { text: '512 GiB' }] },
              { label: 'pvc-minio-cdn', segments: [{ value: 4_400, label: 'reads' }, { value: 2_920, label: 'writes' }], spark: buildSpark(9, 7_500), total: 7_320, unit: ' IOPS', delta: -34, badges: [{ text: 'rbd' }, { text: 'p99 154µs', tone: 'warn' }, { text: 'rwx' }, { text: '2 TiB' }] },
              { label: 'pvc-pg-billing', segments: [{ value: 3_200, label: 'reads' }, { value: 2_010, label: 'writes' }], spark: buildSpark(12, 5_400), total: 5_210, unit: ' IOPS', delta: 18, badges: [{ text: 'zfs' }, { text: 'p99 188µs', tone: 'warn' }, { text: 'rwo' }, { text: '256 GiB' }] },
              { label: 'pvc-opensearch', segments: [{ value: 2_800, label: 'queries' }, { value: 1_640, label: 'index' }], spark: buildSpark(15, 4_500), total: 4_440, unit: ' IOPS', delta: 64, badges: [{ text: 'longhorn' }, { text: 'p99 142µs' }, { text: 'rwo' }, { text: '128 GiB' }] },
              { label: 'pvc-mongo-primary', segments: [{ value: 2_200, label: 'finds' }, { value: 1_320, label: 'updates' }, { value: 280, label: 'inserts' }], spark: buildSpark(18, 3_800), total: 3_800, unit: ' IOPS', delta: -12, badges: [{ text: 'longhorn' }, { text: 'p99 96µs', tone: 'good' }, { text: 'rwo' }, { text: '256 GiB' }] },
              { label: 'pvc-clickhouse', segments: [{ value: 1_800, label: 'queries' }, { value: 1_120, label: 'merges' }], spark: buildSpark(21, 3_000), total: 2_920, unit: ' IOPS', delta: 88, badges: [{ text: 'nvme-of', tone: 'good' }, { text: 'p99 78µs', tone: 'good' }, { text: 'rwo' }, { text: '1 TiB' }] },
            ] as RichBarRow[];
          })()}
        />
      </article>
      </>
      )}

      {isLive && liveBackends.length === 0 && pvcs.length === 0 && (
        <LiveEmptyPanel
          title="No user storage volumes detected"
          detail="Create a PVC or VM disk in a tenant namespace to see storage classes and claims here. Platform volumes in kube-system and cattle-* are excluded."
        />
      )}

      {liveBackends.length > 0 && (
      <div className="storage-backend-grid">
        {liveBackends.map((backend) => {
          const rad = 38;
          const circ = 2 * Math.PI * rad;
          const offset = circ * (1 - backend.usagePercent / 100);
          return (
            <article key={backend.id} className={`backend-card backend-${backend.kind} health-${backend.driverHealth}`}>
              <div className="backend-head">
                <span className={`kind-chip kind-${backend.kind}`}>{backend.kind}</span>
                <strong>{backend.label}</strong>
              </div>
              <svg viewBox="0 0 100 100" className="backend-radial" aria-hidden="true">
                <circle cx="50" cy="50" r={rad} className="radial-track" />
                <circle cx="50" cy="50" r={rad} className="radial-fill" strokeDasharray={`${circ}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
                <text x="50" y="48" textAnchor="middle" className="radial-value">{backend.usagePercent}%</text>
                <text x="50" y="62" textAnchor="middle" className="radial-sub">{backend.capacityTiB}TiB</text>
              </svg>
              <dl className="backend-stats">
                <div><dt>IOPS</dt><dd><LiveValue value={backend.iops.toLocaleString()} /></dd></div>
                <div><dt>R</dt><dd>{backend.readMiBs} MiB/s</dd></div>
                <div><dt>W</dt><dd>{backend.writeMiBs} MiB/s</dd></div>
              </dl>
              <div className="backend-features">
                {backend.features.map((feat) => <span key={feat}>{feat}</span>)}
              </div>
              <small className="backend-driver">{backend.csiTemplate}</small>
            </article>
          );
        })}
      </div>
      )}

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>PVC lanes</span><strong>{pvcs.length} claims</strong></div>
          {pvcs.length === 0 ? (
            <p className="live-empty-inline">No user PVCs in tenant namespaces.</p>
          ) : (
          <table className="dash-table">
            <thead><tr><th>name</th><th>ns</th><th>class</th><th>size</th><th>mode</th><th>status</th></tr></thead>
            <tbody>
              {pvcs.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.namespace}</td>
                  <td><code>{row.storageClass}</code></td>
                  <td>{row.sizeGiB} GiB</td>
                  <td><span className="access-chip">{row.accessMode}</span></td>
                  <td><span className={`status-chip status-${row.status}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </article>

        {!isLive && (
        <article className="dash-panel">
          <div className="panel-title"><span>Snapshot + replication shelves</span><strong>{snapshots.length} snapshots · {replicationLinks.length} links</strong></div>
          <ul className="snapshot-shelf">
            {snapshots.map((snap) => (
              <li key={snap.id}>
                <span className="snap-driver">{snap.driver}</span>
                <strong>{snap.workload}</strong>
                <small>{snap.takenAt} · {snap.size}{snap.replicated ? ' · replicated' : ''}</small>
                <em>{snap.retentionPolicy}</em>
              </li>
            ))}
          </ul>
          <ul className="replication-links">
            {replicationLinks.map((link) => (
              <li key={`${link.source}-${link.target}`}>
                <span>{link.source}</span>
                <i className={`repl-mode mode-${link.mode}`} />
                <span>{link.target}</span>
                <b>{link.lagSeconds === 0 ? 'live' : `lag ${link.lagSeconds}s`}</b>
              </li>
            ))}
          </ul>
        </article>
        )}
      </div>
    </section>
  );
}

export function MachinesDashboardView({ telemetry, dataSource, machinesDashboard }: DashboardViewProps = {}) {
  const machinesData = machinesDashboard ?? machines;
  const { fleet, migrations, affinityRules, ha, consoleChips } = machinesData;
  const isLive = dataSource === 'live';
  const liveMigrations = useMemo(() => {
    if (isLive || !telemetry) return migrations;
    const progressShift = (telemetry.tick * 7) % 32;
    return migrations.map((mig, index) => ({
      ...mig,
      progress: Math.min(98, (mig.progress + progressShift + index * 4) % 99),
    }));
  }, [isLive, migrations, telemetry]);
  const liveFleet = useMemo(() => {
    if (isLive || !telemetry) return fleet;
    const cpuFactor = telemetry.cpuPercent / 58;
    return fleet.map((row) => ({
      ...row,
      cpuPercent: Math.max(4, Math.min(99, Math.round(row.cpuPercent * cpuFactor))),
    }));
  }, [isLive, fleet, telemetry]);
  return (
    <section className="dash dash-machines" aria-label="Machines and containers dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">FLEET // COMPUTE</span>
          <h2>{machinesData.title}</h2>
          <p>{isLive ? 'User VMs and pods in tenant namespaces (platform pods excluded).' : 'VM / LXC / Docker / Pod fleet with live migration, HA, affinity, console launch.'}</p>
        </div>
        <div className="dash-totals">
          <div><span>Workloads</span><strong>{liveFleet.length}</strong></div>
          <div><span>Migrations</span><strong><LiveValue value={liveMigrations.length} /></strong></div>
        </div>
      </header>

      {isLive && liveFleet.length === 0 && (
        <LiveEmptyPanel
          title="No user VMs or pods running"
          detail="KubeVirt VMs and pods in tenant namespaces appear here. Harvester platform pods in kube-system, longhorn-system, and cattle-* are not counted as workloads."
        />
      )}

      {liveMigrations.length > 0 && (
      <article className="dash-panel migration-panel">
        <div className="panel-title"><span>Live migration arcs</span><strong>vMotion-style · memory state preserved</strong></div>
        <svg viewBox="0 0 100 30" className="migration-svg" preserveAspectRatio="none" aria-hidden="true">
          {liveMigrations.map((mig, index) => {
            const x1 = 8 + index * 28;
            const x2 = x1 + 22;
            const y = 16;
            const mx = (x1 + x2) / 2;
            const my = y - 6;
            return (
              <g key={mig.id} className={`migration-arc kind-${mig.kind}`}>
                <path d={`M${x1} ${y} Q ${mx} ${my} ${x2} ${y}`} className="arc-bg" />
                <path d={`M${x1} ${y} Q ${mx} ${my} ${x2} ${y}`} className="arc-fill" strokeDasharray="80" strokeDashoffset={80 - mig.progress * 0.8} />
                <circle cx={x1} cy={y} r="2" className="arc-source" />
                <circle cx={x2} cy={y} r="2" className="arc-target" />
                <text x={mx} y={my - 1.5} textAnchor="middle" className="arc-label">{mig.workload}</text>
                <text x={mx} y={y + 5} textAnchor="middle" className="arc-sub">{mig.source} → {mig.target} · {mig.progress}%</text>
              </g>
            );
          })}
        </svg>
      </article>
      )}

      {liveFleet.length > 0 && (
      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Fleet</span><strong>{liveFleet.length} workloads</strong></div>
          <table className="dash-table">
            <thead><tr><th>name</th><th>kind</th><th>host</th><th>cpu</th><th>ram</th><th>aff</th><th>ha</th><th>status</th></tr></thead>
            <tbody>
              {liveFleet.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td><span className={`kind-chip kind-${row.kind}`}>{row.kind}</span></td>
                  <td>{row.host}</td>
                  <td><div className="mini-bar"><i style={{ width: `${row.cpuPercent}%` }} /></div><small><LiveValue value={`${row.cpuPercent}%`} /></small></td>
                  <td>{row.ramGiB} / {row.ramAllocGiB} GiB</td>
                  <td><span className={`affinity-chip aff-${row.affinity}`}>{row.affinity}</span></td>
                  <td>{row.haEnabled ? 'on' : '—'}</td>
                  <td><span className={`status-chip status-${row.status}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        {!isLive && (
        <div className="machine-side-stack">
          <article className="dash-panel">
            <div className="panel-title"><span>Affinity rules</span><strong>{affinityRules.length}</strong></div>
            <ul className="affinity-list">
              {affinityRules.map((rule) => (
                <li key={rule.id} className={`affinity-mode-${rule.mode}`}>
                  <strong>{rule.name}</strong>
                  <span>{rule.mode}</span>
                  <small>{rule.members.join(' · ')}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className="dash-panel">
            <div className="panel-title"><span>High availability</span><strong>{ha.filter((row) => row.active).length} active</strong></div>
            <ul className="ha-list">
              {ha.map((row) => (
                <li key={row.name}>
                  <strong>{row.name}</strong>
                  <small>{row.restartWindowSeconds}s window · {row.lastEvent}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className="dash-panel">
            <div className="panel-title"><span>Console chips</span><strong>{consoleChips.length}</strong></div>
            <div className="console-chips">
              {consoleChips.map((chip) => (
                <button key={chip.id} type="button" className={`console-chip type-${chip.type} state-${chip.state}`}>
                  <span>{chip.type}</span>
                  <strong>{chip.target}</strong>
                </button>
              ))}
            </div>
          </article>
        </div>
        )}
      </div>
      )}
    </section>
  );
}

function CoreHeatCell({ core }: { core: CpuCore }) {
  return (
    <span
      className={`core-cell thread-${core.thread}`}
      title={`core ${core.id} · ${core.utilizationPercent}% · ${core.frequencyGhz.toFixed(1)} GHz`}
      style={{ '--core-fill': `${core.utilizationPercent}%` } as React.CSSProperties}
    />
  );
}

export function ProcessorMemoryDashboardView({ telemetry, dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Processor & Memory" dataSource={dataSource} />;
  }
  const { numaZones, memoryTiers, pressureWaterfall, swapDevices, hugepages } = procmem;
  const liveZones = useMemo(() => {
    if (!telemetry) return numaZones;
    const cpuFactor = telemetry.cpuPercent / 58;
    return numaZones.map((zone) => ({
      ...zone,
      cores: zone.cores.map((core) => ({
        ...core,
        utilizationPercent: Math.max(4, Math.min(100, Math.round(core.utilizationPercent * cpuFactor))),
      })),
    }));
  }, [telemetry]);
  const livePressure = useMemo(() => {
    if (!telemetry) return pressureWaterfall;
    const cpuFactor = telemetry.cpuPercent / 58;
    const memFactor = telemetry.ramPercent / 64;
    return pressureWaterfall.map((sample, idx) => ({
      ...sample,
      cpuPressure: Math.round(sample.cpuPressure * (idx === pressureWaterfall.length - 1 ? cpuFactor : 1)),
      memoryPressure: Math.round(sample.memoryPressure * (idx === pressureWaterfall.length - 1 ? memFactor : 1)),
    }));
  }, [telemetry]);
  const maxPressure = Math.max(
    ...livePressure.flatMap((sample) => [sample.cpuPressure, sample.memoryPressure, sample.ioPressure]),
  );
  return (
    <section className="dash dash-procmem" aria-label="Processor and memory dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CORE // MEMORY</span>
          <h2>{procmem.title}</h2>
          <p>NUMA core heatmap, memory tier topology, pressure waterfall, hugepages, swap devices.</p>
        </div>
        <div className="dash-totals">
          <div><span>Cores</span><strong>{numaZones.reduce((sum, zone) => sum + zone.cores.length, 0)}</strong></div>
          <div><span>DRAM</span><strong>{memoryTiers[0]?.capacityGiB} GiB</strong></div>
        </div>
      </header>

      <article className="dash-panel">
        <div className="panel-title"><span>NUMA core heatmap</span><strong>{numaZones.length} zones</strong></div>
        <div className="numa-zones">
          {liveZones.map((zone) => (
            <div key={zone.id} className="numa-zone">
              <div className="numa-head">
                <strong>{zone.id}</strong>
                <span>{zone.localRamGiB} GiB local · {zone.remoteHitsPct}% remote</span>
              </div>
              <div className="core-grid">
                {zone.cores.map((core) => <CoreHeatCell key={core.id} core={core} />)}
              </div>
            </div>
          ))}
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Memory tier topology</span><strong>{memoryTiers.length} tiers</strong></div>
          <ul className="memory-tiers">
            {memoryTiers.map((tier) => (
              <li key={tier.id} className={`tier-${tier.id}`}>
                <div className="tier-head">
                  <strong>{tier.label}</strong>
                  <span>{tier.usedGiB} / {tier.capacityGiB} GiB</span>
                </div>
                <div className="tier-bar"><i style={{ width: `${(tier.usedGiB / tier.capacityGiB) * 100}%` }} /></div>
                <div className="tier-sub">
                  <span>{tier.latencyNs}ns latency</span>
                  <span>{tier.throughputGiBs} GiB/s</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Pressure waterfall</span><strong>cpu / mem / io</strong></div>
          <div className="pressure-waterfall">
            {livePressure.map((sample) => (
              <div key={sample.label} className="pressure-column">
                <span className="pressure-bar pressure-cpu" style={{ height: `${(sample.cpuPressure / maxPressure) * 100}%` }} />
                <span className="pressure-bar pressure-mem" style={{ height: `${(sample.memoryPressure / maxPressure) * 100}%` }} />
                <span className="pressure-bar pressure-io" style={{ height: `${(sample.ioPressure / maxPressure) * 100}%` }} />
                <small>{sample.label}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Swap devices</span><strong>{swapDevices.length}</strong></div>
          <ul className="swap-list">
            {swapDevices.map((dev) => (
              <li key={dev.device}>
                <strong>{dev.device}</strong>
                <div className="tier-bar"><i style={{ width: `${(dev.usedGiB / dev.sizeGiB) * 100}%` }} /></div>
                <small>{dev.usedGiB} / {dev.sizeGiB} GiB · prio {dev.priority}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Hugepages</span><strong>2MiB + 1GiB</strong></div>
          <ul className="hugepage-list">
            {hugepages.map((page) => (
              <li key={page.sizeMiB}>
                <strong>{page.sizeMiB} MiB pages</strong>
                <div className="tier-bar"><i style={{ width: `${(page.allocated / (page.allocated + page.free)) * 100}%` }} /></div>
                <small>{page.allocated} allocated · {page.free} free</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function OperationsDashboardView({ telemetry, dataSource, operationsLinks }: DashboardViewProps = {}) {
  const isLive = dataSource === 'live';
  const { cost, power, rightSizing, compliance, cve, audit, gitops, backupSla, drPlans } = ops;
  const livePower = useMemo(() => {
    if (!telemetry) return power;
    const factor = telemetry.watts / 1_592;
    return power.map((row) => ({
      ...row,
      watts: Math.round(row.watts * factor),
      kwhMonth: Math.round(row.kwhMonth * factor),
      co2KgMonth: Math.round(row.co2KgMonth * factor),
    }));
  }, [telemetry]);
  const costTotal = cost.reduce((sum, row) => sum + row.monthlyEuro, 0);
  const powerTotal = livePower.reduce((sum, row) => sum + row.kwhMonth, 0);
  const co2Total = livePower.reduce((sum, row) => sum + row.co2KgMonth, 0);
  const maxBar = Math.max(...cost.map((row) => row.monthlyEuro));
  return (
    <section className="dash dash-operations" aria-label="Operations and compliance dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">OPS // COMPLIANCE</span>
          <h2>{ops.title}</h2>
          <p>{isLive ? 'Harvester observability links and cluster-level power estimate from live nodes.' : 'Cost · sustainability · CVE · CIS · audit · GitOps · backups · DR.'}</p>
        </div>
        <div className="dash-totals">
          {isLive ? (
            <>
              <div><span>CPU</span><strong><LiveValue value={`${telemetry?.cpuPercent?.toFixed(1) ?? '0'}%`} /></strong></div>
              <div><span>RAM</span><strong><LiveValue value={`${telemetry?.ramPercent?.toFixed(1) ?? '0'}%`} /></strong></div>
              <div><span>Est. watts</span><strong><LiveValue value={telemetry?.watts ?? 0} /></strong></div>
            </>
          ) : (
            <>
              <div><span>€/month</span><strong>€{costTotal.toFixed(0)}</strong></div>
              <div><span>kWh/mo</span><strong><LiveValue value={powerTotal.toFixed(0)} /></strong></div>
              <div><span>CO₂ kg/mo</span><strong><LiveValue value={co2Total.toFixed(0)} /></strong></div>
            </>
          )}
        </div>
      </header>

      {operationsLinks?.monitoringEnabled && (
        <article className="dash-panel ops-links-panel">
          <div className="panel-title">
            <span>Harvester observability</span>
            <strong>rancher-monitoring addon</strong>
          </div>
          <div className="ops-external-links">
            <a href={operationsLinks.grafanaUrl} target="_blank" rel="noreferrer">
              Grafana dashboards
            </a>
            <a href={operationsLinks.alertmanagerUrl} target="_blank" rel="noreferrer">
              Alertmanager
            </a>
            <a href={operationsLinks.harvesterReadyZ} target="_blank" rel="noreferrer">
              Harvester readyz
            </a>
          </div>
        </article>
      )}

      {isLive ? (
        <LiveEmptyPanel
          title="Compliance and chargeback panels are demo-only"
          detail="Live mode shows cluster CPU/RAM/watts and Harvester Grafana links above. Open Grafana for CVE, audit, GitOps, and backup metrics from rancher-monitoring."
        />
      ) : (
      <>
      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Cost · chargeback</span><strong>top 5 workloads</strong></div>
          <ul className="cost-list">
            {cost.map((row) => (
              <li key={row.id}>
                <strong>{row.workload}</strong>
                <div className="cost-bar"><i style={{ width: `${(row.monthlyEuro / maxBar) * 100}%` }} /></div>
                <b>€{row.monthlyEuro.toFixed(1)}</b>
                <small className={row.trendPercent > 0 ? 'trend-up' : row.trendPercent < 0 ? 'trend-down' : 'trend-flat'}>
                  {row.trendPercent > 0 ? '+' : ''}{row.trendPercent}%
                </small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Power · carbon</span><strong>kWh · €/mo · CO₂</strong></div>
          <table className="dash-table">
            <thead><tr><th>node</th><th>W</th><th>kWh/mo</th><th>CO₂ kg</th><th>PUE</th></tr></thead>
            <tbody>
              {livePower.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.node}</strong></td>
                  <td><LiveValue value={row.watts} /></td>
                  <td>{row.kwhMonth}</td>
                  <td>{row.co2KgMonth}</td>
                  <td>{row.pue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Right-sizing insights</span><strong>{rightSizing.length} hints</strong></div>
          <ul className="hint-list">
            {rightSizing.map((hint) => (
              <li key={hint.workload} className={`hint-${hint.hint}`}>
                <span className="hint-chip">{hint.hint.replace('-', ' ')}</span>
                <strong>{hint.workload}</strong>
                <small>{hint.detail}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Compliance lanes</span><strong>BSI · ISO · NIS2 · SOC2</strong></div>
          <ul className="compliance-lanes">
            {compliance.map((lane) => (
              <li key={lane.framework}>
                <strong>{lane.framework}</strong>
                <div className="tier-bar"><i style={{ width: `${lane.hardeningScore}%` }} /></div>
                <small>{lane.controlsCovered} / {lane.controlsTotal} controls · {lane.hardeningScore}% hardening</small>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>CVE buckets</span><strong>{cve.reduce((s, b) => s + b.count, 0)} total</strong></div>
          <div className="cve-buckets">
            {cve.map((bucket) => (
              <div key={bucket.severity} className={`cve-bucket sev-${bucket.severity}`}>
                <strong>{bucket.count}</strong>
                <span>{bucket.severity}</span>
                <small className={bucket.trend >= 0 ? 'trend-up' : 'trend-down'}>{bucket.trend >= 0 ? '+' : ''}{bucket.trend}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>HMAC-signed audit feed</span><strong>{audit.length} recent</strong></div>
          <ul className="audit-feed">
            {audit.map((event) => (
              <li key={event.id} className={`audit-${event.severity}`}>
                <span className="audit-time">{event.timestamp}</span>
                <strong>{event.actor}</strong>
                <span>{event.action}</span>
                <small>{event.target}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>GitOps targets</span><strong>ArgoCD · Flux · Jenkins-X</strong></div>
          <ul className="gitops-list">
            {gitops.map((target) => (
              <li key={target.id} className={`sync-${target.syncState}`}>
                <strong>{target.name}</strong>
                <span className="provider-chip">{target.provider}</span>
                <span className="sync-chip">{target.syncState}</span>
                <small>rev {target.revision} · {target.lastSyncSeconds}s ago</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Backup SLA + DR</span><strong>PBS · ZFS · longhorn</strong></div>
          <ul className="backup-sla">
            {backupSla.map((row) => (
              <li key={`${row.cluster}-${row.datastore}`} className={row.lastBackupMinutesAgo > row.rpoMinutes ? 'rpo-breach' : 'rpo-ok'}>
                <strong>{row.cluster}</strong>
                <span>{row.datastore}</span>
                <small>last {row.lastBackupMinutesAgo}m · RPO {row.rpoMinutes}m · verify {row.verifyPassed ? 'ok' : 'fail'}</small>
              </li>
            ))}
          </ul>
          <ul className="dr-plans">
            {drPlans.map((plan) => (
              <li key={plan.id}>
                <strong>{plan.name}</strong>
                <small>{plan.primary} → {plan.secondary} · boot {plan.bootOrder.join(' / ')} · {plan.lastDrill}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title">
          <span>Audit pipeline flame · last drill</span>
          <strong>backup·restore·verify·sign · 7.4s total</strong>
        </div>
        <FlameGraph
          root={{
            name: 'audit.pipeline.full-drill',
            value: 7400,
            status: 'good',
            children: [
              {
                name: 'backup.snapshot',
                value: 2200,
                status: 'good',
                children: [
                  { name: 'csi.freeze', value: 220 },
                  { name: 'csi.snapshot', value: 1180, status: 'good' },
                  { name: 'csi.unfreeze', value: 240 },
                  { name: 'meta.tag', value: 560 },
                ],
              },
              {
                name: 'restore.test',
                value: 2400,
                status: 'warn',
                children: [
                  { name: 'csi.clone', value: 980, status: 'warn' },
                  { name: 'fs.mount', value: 420 },
                  { name: 'fs.fsck', value: 620, status: 'warn' },
                  { name: 'data.verify', value: 380 },
                ],
              },
              {
                name: 'verify.integrity',
                value: 1300,
                status: 'good',
                children: [
                  { name: 'hash.sha256', value: 540 },
                  { name: 'sig.verify', value: 360 },
                  { name: 'manifest.diff', value: 400, status: 'good' },
                ],
              },
              {
                name: 'sign.artifact',
                value: 900,
                status: 'good',
                children: [
                  { name: 'cosign.sign', value: 540 },
                  { name: 'tuf.publish', value: 360 },
                ],
              },
              { name: 'notify.audit', value: 380 },
              { name: 'cleanup', value: 220 },
            ],
          }}
          height={210}
        />
      </article>
      </>
      )}
    </section>
  );
}

export function PolyComputeDashboardView({ telemetry, dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Poly-Compute Engine" dataSource={dataSource} />;
  }
  const { runtimes, nodeBlend, topologyAwareScheduling, unifiedScheduler } = poly;
  const liveRuntimes = useMemo(() => {
    if (!telemetry) return runtimes;
    const cpuFactor = telemetry.cpuPercent / 58;
    return runtimes.map((runtime) => ({
      ...runtime,
      cpuShare: Math.max(5, Math.min(99, Math.round(runtime.cpuShare * cpuFactor))),
    }));
  }, [telemetry]);
  const maxDensity = Math.max(...nodeBlend.map((node) => node.densityScore));
  return (
    <section className="dash dash-poly-compute" aria-label="Poly-compute engine dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">RUNTIME // POLY-COMPUTE</span>
          <h2>{poly.title}</h2>
          <p>Unified engine running KubeVirt VMs, Incus/LXC system containers, and native K8s pods on the same bare-metal loop.</p>
        </div>
        <div className="dash-totals">
          <div><span>Workloads</span><strong>{runtimes.reduce((sum, r) => sum + r.workloadCount, 0)}</strong></div>
          <div><span>Runtimes</span><strong>{runtimes.length}</strong></div>
        </div>
      </header>

      <div className="poly-runtime-grid">
        {liveRuntimes.map((runtime) => (
          <article key={runtime.id} className={`poly-runtime poly-${runtime.id}`}>
            <div className="poly-runtime-head">
              <span className={`kind-chip kind-${runtime.id === 'kubevirt' ? 'vm' : runtime.id === 'incus-lxc' ? 'lxc' : 'pod'}`}>{runtime.id}</span>
              <strong>{runtime.label}</strong>
            </div>
            <p className="poly-runtime-desc">{runtime.description}</p>
            <dl className="poly-runtime-stats">
              <div><dt>Workloads</dt><dd>{runtime.workloadCount}</dd></div>
              <div><dt>CPU share</dt><dd><LiveValue value={`${runtime.cpuShare}%`} /></dd></div>
              <div><dt>RAM share</dt><dd>{runtime.ramShare}%</dd></div>
              <div><dt>Kernel</dt><dd>{runtime.kernelMode}</dd></div>
              <div><dt>Live migrate</dt><dd>{runtime.liveMigration ? 'yes' : 'no'}</dd></div>
            </dl>
            <div className="poly-runtime-features">
              {runtime.features.map((feat) => <span key={feat}>{feat}</span>)}
            </div>
          </article>
        ))}
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Mixed-mode node density</span><strong>VM · system container · pod</strong></div>
        <div className="poly-blend-list">
          {nodeBlend.map((blend) => {
            const total = blend.vms + blend.systemContainers + blend.pods;
            const vmShare = (blend.vms / total) * 100;
            const sysShare = (blend.systemContainers / total) * 100;
            const podShare = (blend.pods / total) * 100;
            return (
              <div key={blend.node} className="poly-blend-row">
                <strong>{blend.node}</strong>
                <div className="poly-blend-bar" title={`${blend.vms} VMs · ${blend.systemContainers} sys containers · ${blend.pods} pods`}>
                  <i className="blend-vm"  style={{ width: `${vmShare}%` }} />
                  <i className="blend-sys" style={{ width: `${sysShare}%` }} />
                  <i className="blend-pod" style={{ width: `${podShare}%` }} />
                </div>
                <small>
                  {blend.vms} vm · {blend.systemContainers} sys · {blend.pods} pod
                </small>
                <b className="density-score" style={{ opacity: 0.4 + (blend.densityScore / maxDensity) * 0.6 }}>{blend.densityScore}</b>
              </div>
            );
          })}
        </div>
        <div className="poly-blend-legend">
          <span className="blend-vm">KubeVirt VMs</span>
          <span className="blend-sys">Incus / LXC system containers</span>
          <span className="blend-pod">Native K8s pods</span>
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Topology-aware scheduling policies</span><strong>{topologyAwareScheduling.filter((p) => p.enabled).length} active</strong></div>
          <ul className="topology-policy-list">
            {topologyAwareScheduling.map((policy) => (
              <li key={policy.policy} className={policy.enabled ? 'policy-on' : 'policy-off'}>
                <span className="policy-dot" aria-hidden="true" />
                <strong>{policy.policy}</strong>
                <small>{policy.description}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Unified scheduler signals</span><strong>poly-compute</strong></div>
          <ul className="scheduler-stat-list">
            {unifiedScheduler.map((stat) => (
              <li key={stat.metric}>
                <span>{stat.metric}</span>
                <strong>{stat.value}</strong>
                <small>{stat.trend}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function AccelerationDashboardView({ telemetry, dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Acceleration & Hardware Pass-Through" dataSource={dataSource} />;
  }
  const { features, numaPinning, passThrough, nestedClusters, dpdkPorts, spdkLanes } = accel;
  const liveFeatures = useMemo(() => {
    if (!telemetry) return features;
    const drift = ((telemetry.tick * 3) % 12) - 6;
    return features.map((feature) => ({
      ...feature,
      utilizationPercent: Math.max(8, Math.min(99, feature.utilizationPercent + drift)),
    }));
  }, [telemetry]);
  const liveDpdk = useMemo(() => {
    if (!telemetry) return dpdkPorts;
    const factor = telemetry.ingressMbps / 78_420;
    return dpdkPorts.map((port) => ({
      ...port,
      loadPercent: Math.max(8, Math.min(99, Math.round(port.loadPercent * factor))),
      packetsPerSecond: Math.round(port.packetsPerSecond * factor),
    }));
  }, [telemetry]);
  return (
    <section className="dash dash-acceleration" aria-label="Acceleration and pass-through dashboard">
      <RouteDecoration />
      <header className="dash-header">
        <div>
          <span className="dash-kicker">SILICON // ACCEL</span>
          <h2>{accel.title}</h2>
          <p>SPDK, DPDK, vhost-user fast paths · NUMA pinning + 1 GiB hugepages · GPU / FPGA / smart-NIC pass-through · nested virtualization for AI/ML.</p>
        </div>
        <div className="dash-totals">
          <div><span>Features</span><strong>{features.filter((f) => f.enabled).length}/{features.length}</strong></div>
          <div><span>Pass-through</span><strong>{passThrough.length}</strong></div>
          <div><span>Nested</span><strong>{nestedClusters.length}</strong></div>
        </div>
      </header>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>Accelerator utilization · polar</span>
            <strong>{liveFeatures.length} fast paths</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadialBarChart
              bars={liveFeatures.slice(0, 8).map((f) => ({ label: f.label, value: f.utilizationPercent }))}
              size={300}
              innerLabel="ACCEL"
              innerValue={`${Math.round(liveFeatures.reduce((a, f) => a + f.utilizationPercent, 0) / liveFeatures.length)}%`}
            />
          </div>
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>NUMA · pass-through chord</span>
            <strong>numa node ↔ device</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ChordDiagram
              groups={[
                { label: 'numa-0', color: 'var(--theme-accent)' },
                { label: 'numa-1', color: 'var(--theme-accent-2)' },
                { label: 'gpu-A100', color: 'var(--theme-good)' },
                { label: 'gpu-H100', color: 'var(--theme-good)' },
                { label: 'fpga', color: 'var(--theme-warn)' },
                { label: 'smart-NIC', color: 'var(--theme-danger)' },
              ]}
              links={[
                { source: 0, target: 2, value: 18 },
                { source: 0, target: 4, value: 12 },
                { source: 0, target: 5, value: 14 },
                { source: 1, target: 3, value: 22 },
                { source: 1, target: 5, value: 10 },
                { source: 1, target: 4, value: 8 },
                { source: 2, target: 1, value: 6 },
                { source: 3, target: 0, value: 9 },
              ]}
              size={280}
              tick={telemetry?.tick ?? 0}
            />
          </div>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Acceleration feature mesh</span><strong>data-path · scheduling · pass-through · nested-virt</strong></div>
        <div className="accel-feature-grid">
          {liveFeatures.map((feature) => (
            <article key={feature.id} className={`accel-feature accel-${feature.kind} ${feature.enabled ? 'on' : 'off'}`}>
              <div className="accel-feature-head">
                <span className="accel-feature-kind">{feature.kind.replace('-', ' ')}</span>
                <strong>{feature.label}</strong>
              </div>
              <p>{feature.detail}</p>
              <div className="accel-util-bar" aria-label={`utilization ${feature.utilizationPercent}%`}>
                <i style={{ width: `${feature.utilizationPercent}%` }} />
                <b><LiveValue value={`${feature.utilizationPercent}%`} /></b>
              </div>
            </article>
          ))}
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>NUMA pinning + hugepages</span><strong>{numaPinning.length} workloads pinned</strong></div>
          <table className="dash-table">
            <thead><tr><th>workload</th><th>numa</th><th>cores</th><th>hugepages</th><th>pci</th></tr></thead>
            <tbody>
              {numaPinning.map((entry) => (
                <tr key={entry.workload}>
                  <td><strong>{entry.workload}</strong></td>
                  <td>{entry.numaZone}</td>
                  <td>
                    <span title={`cores ${entry.cores.join(', ')}`}>
                      {entry.cores.length} cores
                    </span>
                  </td>
                  <td>{entry.hugepageCount} × {entry.hugepageSizeMiB >= 1024 ? `${entry.hugepageSizeMiB / 1024} GiB` : `${entry.hugepageSizeMiB} MiB`}</td>
                  <td>
                    {entry.pciDevices.map((dev) => (
                      <code key={dev}>{dev}</code>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Pass-through devices</span><strong>vfio-pci · SR-IOV · mdev</strong></div>
          <ul className="passthrough-list">
            {passThrough.map((dev) => (
              <li key={dev.id} className={`pt-${dev.kind}`}>
                <span className={`kind-chip kind-${dev.kind === 'gpu' ? 'block' : dev.kind === 'fpga' ? 'object' : 'file'}`}>{dev.kind}</span>
                <strong>{dev.model}</strong>
                <small>→ {dev.boundTo} · driver {dev.driver}</small>
                <div className="cost-bar"><i style={{ width: `${dev.utilizationPercent}%` }} /></div>
                <b>{dev.utilizationPercent}%</b>
                <em>{dev.memoryGiB} GiB</em>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>SPDK userspace lanes</span><strong>NVMe-oF · Vitastor · Ceph</strong></div>
          <ul className="spdk-lanes">
            {spdkLanes.map((lane) => (
              <li key={lane.lane}>
                <strong>{lane.lane}</strong>
                <dl>
                  <div><dt>Queue depth</dt><dd>{lane.queueDepth}</dd></div>
                  <div><dt>Latency</dt><dd>{lane.latencyMicros} µs</dd></div>
                  <div><dt>Throughput</dt><dd>{lane.throughputGiBs} GiB/s</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>DPDK ring buffers</span><strong>polled-mode userspace ports</strong></div>
          <ul className="dpdk-ports">
            {liveDpdk.map((port) => (
              <li key={port.port}>
                <strong>{port.port}</strong>
                <small>{port.queues} queues · burst {port.burstSize} · <LiveValue value={`${(port.packetsPerSecond / 1_000_000).toFixed(1)} Mpps`} /></small>
                <div className="cost-bar"><i style={{ width: `${port.loadPercent}%` }} /></div>
                <b><LiveValue value={`${port.loadPercent}%`} /></b>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Nested virtualization clusters</span><strong>training · inference · sandbox · ci</strong></div>
        <ul className="nested-cluster-list">
          {nestedClusters.map((cluster) => (
            <li key={cluster.id} className={`nested-role-${cluster.guestRole} nested-status-${cluster.status}`}>
              <strong>{cluster.name}</strong>
              <span className="kind-chip">{cluster.guestRole}</span>
              <small>parent {cluster.parentHost} · {cluster.cpuPinning === 'l1' ? 'L1 nested guest' : 'L2 GPU passthrough'} · {cluster.status}</small>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

export function EnvironmentDashboardView({ dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Environment Intel" dataSource={dataSource} />;
  }
  const { totals, zones, activity, backdropVectors } = environment;
  const vectorPoints = backdropVectors.map((value, index) => `${(index / (backdropVectors.length - 1)) * 100},${100 - value}`).join(' ');

  return (
    <section className="dash dash-environment" aria-label="Environment intelligence dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">ENVIRONMENT // FACILITY</span>
          <h2>{environment.title}</h2>
          <p>Thermals, airflow, humidity, power draw, and facility events rendered as a transparent spatial command layer.</p>
        </div>
        <div className="dash-vip">
          <span>Status</span>
          <strong>{zones.filter((zone) => zone.status !== 'nominal').length} watch zones</strong>
          <small>{zones.length} zones monitored</small>
        </div>
      </header>

      <div className="environment-kpi-grid">
        {totals.map((total) => (
          <article className="environment-kpi" key={total.label}>
            <span>{total.label}</span>
            <strong>{total.value}<small>{total.unit}</small></strong>
            <p>{total.trend}</p>
          </article>
        ))}
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel environment-map-panel">
          <div className="panel-title"><span>Spatial thermal map</span><strong>transparent rack geometry</strong></div>
          <div className="environment-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={vectorPoints} />
              <polygon points="8,20 38,8 88,24 78,82 28,92 12,62" />
            </svg>
            {zones.map((zone) => (
              <span className={`environment-zone zone-${zone.status}`} key={zone.id} style={{ left: `${zone.x}%`, top: `${zone.y}%` }}>
                <b>{zone.thermalC}C</b>
                <small>{zone.label}</small>
              </span>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Facility event rail</span><strong>{activity.length} live events</strong></div>
          <ul className="environment-event-list">
            {activity.map((event) => (
              <li className={`event-${event.severity}`} key={`${event.time}-${event.label}`}>
                <span>{event.time}</span>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Zone telemetry strips</span><strong>thermal · humidity · airflow · power</strong></div>
        <div className="environment-zone-grid">
          {zones.map((zone) => (
            <div className={`environment-zone-card zone-${zone.status}`} key={zone.id}>
              <div><span>{zone.rack}</span><strong>{zone.label}</strong></div>
              <div className="env-meter"><span>Thermal</span><i style={{ width: `${Math.min(100, zone.thermalC * 2.3)}%` }} /><b>{zone.thermalC}C</b></div>
              <div className="env-meter"><span>Humidity</span><i style={{ width: `${zone.humidityPercent}%` }} /><b>{zone.humidityPercent}%</b></div>
              <div className="env-meter"><span>Airflow</span><i style={{ width: `${Math.min(100, zone.airflowCfm / 320)}%` }} /><b>{Math.round(zone.airflowCfm / 1000)}k CFM</b></div>
              <div className="env-meter"><span>Power</span><i style={{ width: `${Math.min(100, zone.powerKw * 4)}%` }} /><b>{zone.powerKw} kW</b></div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function ActivityDashboardView({ dataSource }: DashboardViewProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Activity Command" dataSource={dataSource} />;
  }
  const { signals, lanes, bursts, timeline } = activity;

  return (
    <section className="dash dash-activity" aria-label="Activity command dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">ACTIVITY // COMMAND</span>
          <h2>{activity.title}</h2>
          <p>Automation queues, approvals, apply operations, migrations, backups, and security scans in one operator surface.</p>
        </div>
        <div className="dash-vip">
          <span>Queue</span>
          <strong>{lanes.reduce((sum, lane) => sum + lane.queued, 0)} pending</strong>
          <small>{lanes.reduce((sum, lane) => sum + lane.running, 0)} running</small>
        </div>
      </header>

      <div className="activity-signal-grid">
        {signals.map((signal) => (
          <article className="activity-signal" key={signal.label}>
            <span>{signal.label}</span>
            <strong>{signal.value}<small>{signal.unit}</small></strong>
            <p>{signal.trend}</p>
          </article>
        ))}
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Automation lanes</span><strong>{lanes.length} live queues</strong></div>
          <div className="activity-lane-grid">
            {lanes.map((lane) => (
              <div className="activity-lane" key={lane.id}>
                <div>
                  <strong>{lane.label}</strong>
                  <span>{lane.saturationPercent}% saturated</span>
                </div>
                <div className="activity-lane-stack">
                  <i style={{ width: `${lane.completed / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.running / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.queued / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.failed / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                </div>
                <small>{lane.completed} done · {lane.running} running · {lane.queued} queued · {lane.failed} failed</small>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Command timeline</span><strong>{timeline.length} recent signals</strong></div>
          <ul className="environment-event-list activity-timeline">
            {timeline.map((event) => (
              <li className={`event-${event.severity}`} key={`${event.time}-${event.label}`}>
                <span>{event.time}</span>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Signal burst scopes</span><strong>animated samples</strong></div>
        <div className="activity-burst-grid">
          {bursts.map((burst) => (
            <div className="activity-burst" key={burst.label}>
              <strong>{burst.label}</strong>
              <div>
                {burst.samples.map((sample, index) => (
                  <i key={`${burst.label}-${index}`} style={{ height: `${sample}%`, animationDelay: `${index * 70}ms` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

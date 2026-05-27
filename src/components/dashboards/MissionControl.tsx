import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import { MissionCustomizableArea } from './MissionCustomizableArea';
import {
  buildAccelerationDashboard,
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildStorageDashboard,
} from '../../lib/dashboards';
import {
  ActivityHeatmap,
  ActivityTimeline,
  AnnotatedFft,
  AnnotatedOscilloscope,
  AnomalyStream,
  ApiRateGauge,
  Cluster3DMap,
  DialGauge,
  FlowDiagram,
  GitOpsSyncBank,
  GpuMemoryGrid,
  HorizontalBarCluster,
  KpiTile,
  LiveEventFeed,
  MultiRingGauge,
  PercentileBar,
  RingMeterCluster,
  SparklineGrid,
  StackedAreaChart,
  StatGrid,
  StatReadouts,
  VerticalMeterBank,
  WidgetTitle,
  computeStats,
  useRollingSeries,
} from './Widgets';

const networking = buildNetworkingDashboard();
const storage = buildStorageDashboard();
const machines = buildMachinesDashboard();
const accel = buildAccelerationDashboard();

const channelOf: Record<string, 'mgmt' | 'storage' | 'mesh' | 'vm' | 'gitops'> = {
  mgmt: 'mgmt',
  storage: 'storage',
  mesh: 'mesh',
  vm: 'vm',
  gitops: 'gitops',
};

interface MissionControlProps {
  telemetry?: EnvironmentSnapshot;
}

export function MissionControlView({ telemetry }: MissionControlProps = {}) {
  const cpuSeries = useRollingSeries(telemetry?.cpuPercent ?? 58, 48, telemetry?.tick);
  const ramSeries = useRollingSeries(telemetry?.ramPercent ?? 64, 48, telemetry?.tick);
  const iopsSeries = useRollingSeries(telemetry ? telemetry.totalIops / 12_000 : 90, 48, telemetry?.tick);
  const wattsSeries = useRollingSeries(telemetry?.watts ?? 1592, 48, telemetry?.tick);
  const ingressSeries = useRollingSeries(telemetry ? telemetry.ingressMbps / 1000 : 78, 48, telemetry?.tick);
  const egressSeries = useRollingSeries(telemetry ? telemetry.egressMbps / 1000 : 75, 48, telemetry?.tick);
  const migrSeries = useRollingSeries(telemetry?.activeMigrations ?? 3, 48, telemetry?.tick);

  const rings = useMemo(
    () => [
      { label: 'CPU pressure', value: telemetry?.cpuPercent ?? 58, color: 'accent' as const },
      { label: 'DRAM utilisation', value: telemetry?.ramPercent ?? 64, color: 'accent-2' as const },
      { label: 'IOPS saturation', value: telemetry ? Math.min(95, (telemetry.totalIops / 1_400_000) * 100) : 80, color: 'good' as const },
      { label: 'NIC ingress', value: telemetry ? Math.min(95, (telemetry.ingressMbps / 110_000) * 100) : 71, color: 'warn' as const },
    ],
    [telemetry],
  );

  const mapNodes = useMemo(
    () =>
      networking.topology.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        x: node.x,
        y: node.y,
        status: node.status,
        kind: (node.role === 'control-plane'
          ? 'control'
          : node.role === 'edge'
            ? 'edge'
            : node.role === 'storage'
              ? 'storage'
              : node.role === 'vcluster'
                ? 'vcluster'
                : 'compute') as 'control' | 'compute' | 'storage' | 'edge' | 'vcluster',
        load: node.health,
      })),
    [],
  );

  const mapEdges = useMemo(
    () =>
      networking.topology.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        channel: channelOf[edge.channel] ?? 'mesh',
        load: edge.load,
      })),
    [],
  );

  const verticalMeters = useMemo(() => {
    const cpuFactor = (telemetry?.cpuPercent ?? 58) / 58;
    const wattFactor = (telemetry?.watts ?? 1592) / 1592;
    return machines.fleet.slice(0, 7).map((row) => ({
      label: row.name.replace('-vm-', '·').replace('-lxc-', '·').slice(0, 8),
      value: Math.min(99, Math.round(row.cpuPercent * cpuFactor + (wattFactor - 1) * 12)),
      unit: '%',
      threshold: 80,
    }));
  }, [telemetry]);

  const topCostBars = useMemo(
    () =>
      storage.backends.slice(0, 6).map((backend) => ({
        label: backend.label,
        value: backend.iops,
        unit: ' IOPS',
        detail: `${backend.kind} · ${backend.usagePercent}% used`,
        delta: telemetry ? (telemetry.deltas.totalIops / 12_000) | 0 : 0,
        status:
          backend.usagePercent > 90 ? ('danger' as const) : backend.usagePercent > 75 ? ('warn' as const) : ('good' as const),
      })),
    [telemetry],
  );

  const passThroughBars = useMemo(
    () =>
      accel.passThrough.slice(0, 6).map((dev) => ({
        label: dev.model,
        value: dev.utilizationPercent,
        unit: '%',
        detail: `${dev.kind} · ${dev.boundTo} · ${dev.driver}`,
        status: dev.utilizationPercent > 88 ? ('warn' as const) : ('good' as const),
      })),
    [],
  );

  const oscilloscopeChannels = useMemo(
    () => [
      { label: 'CPU', color: 'var(--theme-accent)', series: cpuSeries, unit: '%' },
      { label: 'DRAM', color: 'var(--theme-accent-2)', series: ramSeries, unit: '%' },
      { label: 'NIC RX', color: 'var(--theme-good)', series: ingressSeries.map((v) => Math.min(100, v)), unit: 'G' },
      { label: 'NIC TX', color: 'var(--theme-warn)', series: egressSeries.map((v) => Math.min(100, v)), unit: 'G' },
    ],
    [cpuSeries, ramSeries, ingressSeries, egressSeries],
  );

  const fleetByKind = useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of machines.fleet) result[row.kind] = (result[row.kind] ?? 0) + 1;
    return result;
  }, []);

  const heatmapRows = useMemo(() => {
    const seed = telemetry?.tick ?? 0;
    const cpuFactor = (telemetry?.cpuPercent ?? 58) / 58;
    return [
      'compute-01',
      'compute-02',
      'compute-03',
      'edge-a',
      'edge-b',
      'ceph-rack',
      'control-plane',
    ].map((node) => ({
      label: node,
      cells: Array.from({ length: 24 }, (_, idx) => {
        const base = (node.charCodeAt(0) + idx * 4 + seed) % 100;
        return Math.max(8, Math.min(99, Math.round(base * cpuFactor + Math.sin((idx + seed) / 3) * 18)));
      }),
    }));
  }, [telemetry]);

  const sparkItems = useMemo(() => {
    const seed = telemetry?.tick ?? 0;
    return [
      { label: 'kubelet rps', current: 1842 + (seed % 80), unit: '/s', status: 'good' as const },
      { label: 'apiserver rps', current: 412 + (seed % 30), unit: '/s', status: 'good' as const },
      { label: 'etcd commit/s', current: 1240 + (seed % 90), unit: '', status: 'good' as const },
      { label: 'cilium drops', current: 6 + (seed % 4), unit: '', status: 'warn' as const },
      { label: 'pod restarts', current: 2 + (seed % 2), unit: '', status: 'warn' as const },
      { label: 'oom kills 24h', current: 0, unit: '', status: 'good' as const },
      { label: 'csi attach/s', current: 18 + (seed % 6), unit: '', status: 'good' as const },
      { label: 'image pulls/min', current: 42 + (seed % 8), unit: '', status: 'good' as const },
      { label: 'pvc bind/s', current: 4 + (seed % 3), unit: '', status: 'good' as const },
      { label: 'snapshots/h', current: 22 + (seed % 5), unit: '', status: 'good' as const },
      { label: 'live migrations', current: telemetry?.activeMigrations ?? 3, unit: '', status: 'warn' as const },
      { label: 'audit events/s', current: 88 + (seed % 18), unit: '', status: 'good' as const },
    ].map((item) => ({
      ...item,
      values: Array.from({ length: 20 }, (_, i) => 40 + Math.sin((i + seed + item.label.length) / 2) * 22 + Math.random() * 8),
    }));
  }, [telemetry]);

  const ringMeters = useMemo(
    () => [
      { label: 'Ceph', value: 72, status: 'good' as const },
      { label: 'Longhorn', value: 58, status: 'good' as const },
      { label: 'NVMe-oF', value: 41, status: 'good' as const },
      { label: 'RDMA', value: 36, status: 'warn' as const },
      { label: 'ZFS', value: 68, status: 'good' as const },
      { label: 'Vitastor', value: 38, status: 'good' as const },
      { label: 'NFS', value: 64, status: 'good' as const },
      { label: 'OpenEBS', value: 33, status: 'good' as const },
    ],
    [],
  );

  // Stacked area: workload mix over a rolling window
  const stackedAreaSeries = useMemo(() => {
    const seed = telemetry?.tick ?? 0;
    const len = 32;
    const buildSeries = (base: number, amp: number, phase: number) =>
      Array.from({ length: len }, (_, i) => Math.max(2, base + Math.sin((i + seed + phase) / 4) * amp + Math.random() * 4));
    return [
      { label: 'KubeVirt VMs', values: buildSeries(34, 8, 0), color: 'var(--theme-accent)' },
      { label: 'LXC system', values: buildSeries(22, 6, 3), color: 'var(--theme-accent-2)' },
      { label: 'K8s pods', values: buildSeries(18, 5, 7), color: 'var(--theme-good)' },
      { label: 'Docker', values: buildSeries(8, 3, 11), color: 'var(--theme-warn)' },
    ];
  }, [telemetry]);

  // Sankey: source-VLAN → destination-service flow
  const flowNodes = useMemo(
    () => [
      { id: 'mgmt', label: 'mgmt-bo', value: 22, side: 'left' as const, color: 'var(--theme-accent-2)' },
      { id: 'workload', label: 'workload-bo', value: 86, side: 'left' as const, color: 'var(--theme-accent)' },
      { id: 'storage-bo', label: 'storage-bo', value: 64, side: 'left' as const, color: 'var(--theme-warn)' },
      { id: 'rdma', label: 'rdma-bo', value: 48, side: 'left' as const, color: 'var(--theme-good)' },
      { id: 'payments', label: 'payments-api', value: 64, side: 'right' as const },
      { id: 'ledger', label: 'ledger-svc', value: 38, side: 'right' as const },
      { id: 'fraud', label: 'fraud-detect', value: 42, side: 'right' as const },
      { id: 'analytics', label: 'analytics-vm', value: 56, side: 'right' as const },
      { id: 'argo', label: 'argocd', value: 20, side: 'right' as const },
    ],
    [],
  );
  const flowLinks = useMemo(
    () => [
      { from: 'mgmt', to: 'argo', value: 18 },
      { from: 'workload', to: 'payments', value: 42 },
      { from: 'workload', to: 'fraud', value: 30 },
      { from: 'workload', to: 'analytics', value: 22 },
      { from: 'storage-bo', to: 'analytics', value: 28 },
      { from: 'storage-bo', to: 'ledger', value: 26 },
      { from: 'rdma', to: 'payments', value: 20 },
      { from: 'rdma', to: 'analytics', value: 16 },
    ],
    [],
  );

  return (
    <section className="dash dash-mission" aria-label="Mission Control overview dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CMD // MISSION CONTROL</span>
          <h2>Mission Control</h2>
          <p>Dark-mode HUD command surface — frosted-glass panels over a near-black backplate. Posture, oscilloscope, dial cluster, vertical meters, route-map, percentile bands, FFT, anomaly stream, heatmap, sparkline grid, GitOps sync bank, GPU memory grid, API rate gauges, activity timeline.</p>
        </div>
        <div className="dash-totals">
          <div><span>Workloads</span><strong>{telemetry?.totalWorkloads ?? 642}</strong></div>
          <div><span>IOPS</span><strong>{telemetry ? `${(telemetry.totalIops / 1000).toFixed(0)}K` : '1.12M'}</strong></div>
          <div><span>Watts</span><strong>{telemetry?.watts ?? 1592}</strong></div>
          <div><span>Trust</span><strong>{telemetry?.trustScore ?? 87}</strong></div>
        </div>
      </header>

      <div className="mission-kpi-row">
        <KpiTile label="CPU" value={`${telemetry?.cpuPercent ?? 58}`} unit="%" delta={telemetry?.deltas.cpuPercent} series={cpuSeries} hint="rolling cluster avg" />
        <KpiTile label="DRAM" value={`${telemetry?.ramPercent ?? 64}`} unit="%" delta={telemetry?.deltas.ramPercent} series={ramSeries} hint="DDR5 + memory tier" />
        <KpiTile label="Cluster IOPS" value={telemetry ? `${(telemetry.totalIops / 1000).toFixed(0)}` : '1120'} unit="K" delta={telemetry ? Math.round(telemetry.deltas.totalIops / 1000) : 0} series={iopsSeries} hint="Ceph · NVMe-oF · Vitastor" status="good" />
        <KpiTile label="Power" value={`${telemetry?.watts ?? 1592}`} unit="W" delta={telemetry?.deltas.watts} series={wattsSeries} hint="aggregate node draw" />
        <KpiTile label="Ingress" value={telemetry ? `${(telemetry.ingressMbps / 1000).toFixed(1)}` : '78.4'} unit="Gb/s" delta={telemetry ? Math.round(telemetry.deltas.ingressMbps / 1000) : 0} series={ingressSeries} hint="NIC bonds aggregated" />
        <KpiTile label="Egress" value={telemetry ? `${(telemetry.egressMbps / 1000).toFixed(1)}` : '74.8'} unit="Gb/s" delta={telemetry ? Math.round(telemetry.deltas.egressMbps / 1000) : 0} series={egressSeries} hint="NIC bonds aggregated" />
        <KpiTile label="Migrations" value={`${telemetry?.activeMigrations ?? 3}`} delta={telemetry?.deltas.activeMigrations} series={migrSeries} hint="vMotion in-flight" status={(telemetry?.activeMigrations ?? 3) > 5 ? 'warn' : 'good'} />
        <KpiTile label="Open CVE" value={`${telemetry?.openCves ?? 17}`} hint="critical & high" status="warn" />
      </div>

      <MissionCustomizableArea>
        <article key="radial" className="dash-panel mission-radial">
          <WidgetTitle kicker="POSTURE" title="Cluster posture rings" trailing={<span className="osc-readout">tick #{telemetry?.tick ?? 0}</span>} />
          <MultiRingGauge
            rings={rings}
            centerLabel="POSTURE"
            centerValue={`${telemetry?.trustScore ?? 87}`}
            centerSub="trust score"
            size={240}
          />
          <StatReadouts stats={computeStats(cpuSeries)} unit="%" compact />
        </article>

        <article key="osc" className="dash-panel mission-osc">
          <WidgetTitle kicker="LIVE-WAVE" title="Oscilloscope · CPU / DRAM / NIC RX / NIC TX" />
          <AnnotatedOscilloscope
            channels={oscilloscopeChannels}
            snapshot={telemetry}
            yMax={100}
            yMin={0}
            divisionsX={10}
            divisionsY={8}
            timeScale="1.6 s / div"
            voltScale="12.5 % / div"
            height={240}
          />
        </article>

        <article key="dials" className="dash-panel mission-dials">
          <WidgetTitle kicker="DIALS" title="Cluster dial gauges" trailing={<span className="osc-readout">analog HUD</span>} />
          <div className="mission-dial-grid">
            <DialGauge value={telemetry?.cpuPercent ?? 58} label="CPU LOAD" unit="%" status={(telemetry?.cpuPercent ?? 58) > 80 ? 'warn' : 'good'} bands={[{ from: 0, to: 60, color: 'var(--theme-good)' }, { from: 60, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry?.ramPercent ?? 64} label="DRAM" unit="%" status={(telemetry?.ramPercent ?? 64) > 80 ? 'warn' : 'good'} bands={[{ from: 0, to: 60, color: 'var(--theme-good)' }, { from: 60, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry ? telemetry.watts / 20 : 80} max={100} label="POWER" unit="kW" status="good" bands={[{ from: 0, to: 70, color: 'var(--theme-good)' }, { from: 70, to: 90, color: 'var(--theme-warn)' }, { from: 90, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry ? Math.min(100, (telemetry.ingressMbps / 110_000) * 100) : 71} max={100} label="NIC RX" unit="%" status="good" bands={[{ from: 0, to: 50, color: 'var(--theme-good)' }, { from: 50, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
          </div>
        </article>

        <article key="meters" className="dash-panel mission-meters">
          <WidgetTitle kicker="LEVELS" title="Fleet CPU level meters" trailing={<span className="osc-readout">{machines.fleet.length} workloads</span>} />
          <VerticalMeterBank meters={verticalMeters} height={170} scale={100} />
        </article>

        <article key="ring-cluster" className="dash-panel mission-ring-cluster">
          <WidgetTitle kicker="BACKENDS" title="Storage backend ring meters" trailing={<span className="osc-readout">{storage.backends.length} drivers</span>} />
          <RingMeterCluster meters={ringMeters} size={84} />
        </article>

        <article key="anomaly" className="dash-panel mission-anomaly">
          <WidgetTitle kicker="ANOMALY" title="Anomaly stream · AUTH / NET / IO" trailing={<span className="osc-readout">threshold 70</span>} />
          <AnomalyStream snapshot={telemetry} height={130} />
        </article>

        <article key="map" className="dash-panel mission-map">
          <WidgetTitle kicker="3D-CITY" title="Cluster topology · isometric pillars" trailing={<span className="osc-readout">live activity</span>} />
          <Cluster3DMap nodes={mapNodes} edges={mapEdges} snapshot={telemetry} height={360} />
        </article>

        <article key="feed" className="dash-panel mission-feed">
          <WidgetTitle kicker="STREAM" title="Live event log" trailing={<span className="env-ticker-live">stream live</span>} />
          <LiveEventFeed snapshot={telemetry} height={260} maxLines={10} />
        </article>

        <article key="heatmap" className="dash-panel mission-heatmap">
          <WidgetTitle kicker="HEATMAP" title="Node activity heatmap · last 24 ticks" trailing={<span className="osc-readout">7 nodes</span>} />
          <ActivityHeatmap rows={heatmapRows} />
        </article>

        <article key="activity" className="dash-panel mission-activity">
          <WidgetTitle kicker="NOW-PLAYING" title="Workload activity timeline" trailing={<span className="osc-readout">live</span>} />
          <ActivityTimeline />
        </article>

        <article key="sparkgrid" className="dash-panel mission-sparkgrid">
          <WidgetTitle kicker="SIGNALS" title="12-channel signal grid" trailing={<span className="osc-readout">/s &amp; /min</span>} />
          <SparklineGrid items={sparkItems} columns={3} />
        </article>

        <article key="gitops" className="dash-panel mission-gitops">
          <WidgetTitle kicker="GITOPS" title="Sync state bank · argocd / flux / jenkins-x" />
          <GitOpsSyncBank />
        </article>

        <article key="gpus" className="dash-panel mission-gpus">
          <WidgetTitle kicker="ACCEL" title="GPU memory + utilisation grid" trailing={<span className="osc-readout">vfio-pci · mdev</span>} />
          <GpuMemoryGrid />
        </article>

        <article key="api" className="dash-panel mission-api">
          <WidgetTitle kicker="API" title="Request rate gauges" trailing={<span className="osc-readout">vs budget</span>} />
          <div className="mission-api-grid">
            <ApiRateGauge label="payments-api" current={1840} budget={2200} max={3000} series={Array.from({ length: 22 }, () => 1500 + Math.random() * 700)} />
            <ApiRateGauge label="ledger-svc" current={920} budget={1200} max={2000} series={Array.from({ length: 22 }, () => 700 + Math.random() * 400)} />
            <ApiRateGauge label="fraud-detect" current={1640} budget={1500} max={2200} series={Array.from({ length: 22 }, () => 1200 + Math.random() * 600)} />
            <ApiRateGauge label="argocd-api" current={48} budget={120} max={300} series={Array.from({ length: 22 }, () => 30 + Math.random() * 40)} />
          </div>
        </article>

        <article key="bars-storage" className="dash-panel mission-bars">
          <WidgetTitle kicker="TOP-N" title="Storage backends · live IOPS" />
          <HorizontalBarCluster bars={topCostBars} />
        </article>

        <article key="bars-passthrough" className="dash-panel mission-bars">
          <WidgetTitle kicker="PASS-THROUGH" title="GPU / FPGA / smart-NIC utilisation" />
          <HorizontalBarCluster bars={passThroughBars} scale={100} />
        </article>

        <article key="stack-mix" className="dash-panel mission-stack">
          <WidgetTitle kicker="STACK" title="Workload mix · last 32 ticks" trailing={<span className="osc-readout">vm + lxc + pod + docker</span>} />
          <StackedAreaChart
            height={140}
            series={[
              { label: 'pods', values: cpuSeries.map((v, i) => 220 + Math.sin((i + (telemetry?.tick ?? 0)) / 3) * 14 + (v / 5)), color: 'var(--theme-accent)' },
              { label: 'lxc', values: cpuSeries.map((_, i) => 90 + Math.sin((i + (telemetry?.tick ?? 0)) / 4) * 8), color: 'var(--theme-accent-2)' },
              { label: 'vms', values: cpuSeries.map((_, i) => 46 + Math.sin((i + (telemetry?.tick ?? 0)) / 5) * 4), color: 'var(--theme-good)' },
              { label: 'docker', values: cpuSeries.map((_, i) => 18 + Math.sin((i + (telemetry?.tick ?? 0)) / 2) * 3), color: 'var(--theme-warn)' },
            ]}
          />
        </article>

        <article key="flow-vlan" className="dash-panel mission-flow">
          <WidgetTitle kicker="FLOW" title="VLAN → service mesh ribbons" trailing={<span className="osc-readout">Mb/s</span>} />
          <FlowDiagram
            height={220}
            nodes={[
              { id: 'vlan-mgmt', label: 'mgmt-bo', value: 220, side: 'left' },
              { id: 'vlan-workload', label: 'workload-bo', value: 1820, side: 'left' },
              { id: 'vlan-storage', label: 'storage-bo', value: 6420, side: 'left' },
              { id: 'vlan-tenant-a', label: 'tenant-a', value: 410, side: 'left' },
              { id: 'svc-payments', label: 'payments', value: 2400, side: 'right' },
              { id: 'svc-ledger', label: 'ledger', value: 1800, side: 'right' },
              { id: 'svc-fraud', label: 'fraud', value: 1640, side: 'right' },
              { id: 'svc-platform', label: 'platform', value: 3030, side: 'right' },
            ]}
            links={[
              { from: 'vlan-mgmt', to: 'svc-platform', value: 220 },
              { from: 'vlan-workload', to: 'svc-payments', value: 1100 },
              { from: 'vlan-workload', to: 'svc-fraud', value: 720 },
              { from: 'vlan-storage', to: 'svc-ledger', value: 1800 },
              { from: 'vlan-storage', to: 'svc-platform', value: 2810 },
              { from: 'vlan-storage', to: 'svc-payments', value: 1300 },
              { from: 'vlan-tenant-a', to: 'svc-fraud', value: 410 },
            ]}
          />
        </article>

        <article key="fft" className="dash-panel mission-fft">
          <WidgetTitle kicker="SPECTRUM" title="Network spectrum (DPDK)" trailing={<span className="osc-readout">64 channel FFT</span>} />
          <AnnotatedFft snapshot={telemetry} bars={64} height={160} freqLabels={['0', '125M', '250M', '500M', '1G', '2G', '4G']} />
        </article>

        <article key="pctile" className="dash-panel mission-pctile">
          <WidgetTitle kicker="PERCENTILES" title="Service-mesh latency bands" />
          <PercentileBar label="api.payments → ledger" p50={28} p95={62} p99={118} scale={200} />
          <PercentileBar label="api.payments → fraud" p50={42} p95={88} p99={142} scale={200} />
          <PercentileBar label="argocd → control-plane" p50={18} p95={36} p99={64} scale={200} />
          <PercentileBar label="prometheus → siem" p50={12} p95={28} p99={52} scale={200} />
        </article>

        <article key="stacked-mix" className="dash-panel mission-stacked">
          <WidgetTitle kicker="STACKED" title="Workload mix over time" trailing={<span className="osc-readout">VM · LXC · POD · DOCKER</span>} />
          <StackedAreaChart series={stackedAreaSeries} height={150} />
        </article>

        <article key="flow-mesh" className="dash-panel mission-flow">
          <WidgetTitle kicker="FLOW" title="VLAN → service traffic flow" trailing={<span className="osc-readout">sankey · live</span>} />
          <FlowDiagram nodes={flowNodes} links={flowLinks} height={210} />
        </article>

        <article key="statgrid" className="dash-panel mission-stats">
          <WidgetTitle kicker="DENSE" title="Workload + driver mix" />
          <StatGrid
            columns={4}
            items={[
              { label: 'VMs', value: fleetByKind.vm ?? 0, hint: 'KubeVirt', status: 'good' },
              { label: 'LXC', value: fleetByKind.lxc ?? 0, hint: 'Incus', status: 'good' },
              { label: 'Docker', value: fleetByKind.docker ?? 0, hint: 'CRI-O', status: 'neutral' },
              { label: 'Pods', value: fleetByKind.pod ?? 0, hint: 'cgroups v2', status: 'good' },
              { label: 'Backends', value: storage.backends.length, hint: 'CSI drivers' },
              { label: 'VLANs', value: networking.vlans.length, hint: 'bonded' },
              { label: 'Routes', value: networking.ingressRoutes.length, hint: 'ingress' },
              { label: 'NIC Bonds', value: networking.nicBonds.length, hint: 'agg', status: networking.nicBonds.some((b) => b.state === 'degraded') ? 'warn' : 'good' },
              { label: 'Pass-thru', value: accel.passThrough.length, hint: 'vfio-pci' },
              { label: 'Nested', value: accel.nestedClusters.length, hint: 'L1 / L2-PT' },
              { label: 'SPDK lanes', value: accel.spdkLanes.length, hint: 'userspace' },
              { label: 'DPDK ports', value: accel.dpdkPorts.length, hint: 'polled' },
            ]}
          />
        </article>
      </MissionCustomizableArea>
    </section>
  );
}

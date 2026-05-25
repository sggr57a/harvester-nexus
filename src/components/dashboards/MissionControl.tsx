import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import {
  buildAccelerationDashboard,
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildStorageDashboard,
} from '../../lib/dashboards';
import {
  AnnotatedFft,
  AnnotatedOscilloscope,
  DialGauge,
  HorizontalBarCluster,
  KpiTile,
  LiveEventFeed,
  MultiRingGauge,
  PercentileBar,
  RouteMap,
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
          backend.usagePercent > 75 ? ('warn' as const) : backend.usagePercent > 90 ? ('danger' as const) : ('good' as const),
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

  return (
    <section className="dash dash-mission" aria-label="Mission Control overview dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CMD // MISSION CONTROL</span>
          <h2>Mission Control</h2>
          <p>Frosted-glass HUD overview — multi-ring posture, dual oscilloscopes, dial gauges, vertical level meters, horizontal bar clusters, percentile bands, spatial route-map, and a streaming event log.</p>
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

      <div className="mission-grid">
        <article className="dash-panel mission-radial">
          <WidgetTitle kicker="POSTURE" title="Cluster posture rings" trailing={<span className="osc-readout">tick #{telemetry?.tick ?? 0}</span>} />
          <MultiRingGauge
            rings={rings}
            centerLabel="POSTURE"
            centerValue={`${telemetry?.trustScore ?? 87}`}
            centerSub="trust score"
            size={260}
          />
          <StatReadouts stats={computeStats(cpuSeries)} unit="%" compact />
        </article>

        <article className="dash-panel mission-osc">
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
            height={260}
          />
        </article>

        <article className="dash-panel mission-dials">
          <WidgetTitle kicker="DIALS" title="Cluster dial gauges" trailing={<span className="osc-readout">analog HUD</span>} />
          <div className="mission-dial-grid">
            <DialGauge value={telemetry?.cpuPercent ?? 58} label="CPU LOAD" unit="%" status={(telemetry?.cpuPercent ?? 58) > 80 ? 'warn' : 'good'} bands={[{ from: 0, to: 60, color: 'var(--theme-good)' }, { from: 60, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry?.ramPercent ?? 64} label="DRAM" unit="%" status={(telemetry?.ramPercent ?? 64) > 80 ? 'warn' : 'good'} bands={[{ from: 0, to: 60, color: 'var(--theme-good)' }, { from: 60, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry ? telemetry.watts / 20 : 80} max={100} label="POWER" unit="kW" status="good" bands={[{ from: 0, to: 70, color: 'var(--theme-good)' }, { from: 70, to: 90, color: 'var(--theme-warn)' }, { from: 90, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry ? Math.min(100, (telemetry.ingressMbps / 110_000) * 100) : 71} max={100} label="NIC RX" unit="%" status="good" bands={[{ from: 0, to: 50, color: 'var(--theme-good)' }, { from: 50, to: 80, color: 'var(--theme-warn)' }, { from: 80, to: 100, color: 'var(--theme-danger)' }]} />
          </div>
        </article>

        <article className="dash-panel mission-meters">
          <WidgetTitle kicker="LEVELS" title="Fleet CPU level meters" trailing={<span className="osc-readout">{machines.fleet.length} workloads</span>} />
          <VerticalMeterBank meters={verticalMeters} height={170} scale={100} />
        </article>

        <article className="dash-panel mission-map">
          <WidgetTitle kicker="ROUTE-MAP" title="Spatial cluster map" trailing={<span className="osc-readout">{networking.topology.nodes.length} nodes · {networking.topology.edges.length} routes</span>} />
          <RouteMap nodes={mapNodes} edges={mapEdges} snapshot={telemetry} />
        </article>

        <article className="dash-panel mission-feed">
          <WidgetTitle kicker="STREAM" title="Live event log" trailing={<span className="env-ticker-live">stream live</span>} />
          <LiveEventFeed snapshot={telemetry} height={260} maxLines={10} />
        </article>

        <article className="dash-panel mission-bars">
          <WidgetTitle kicker="TOP-N" title="Storage backends · live IOPS" />
          <HorizontalBarCluster bars={topCostBars} />
        </article>

        <article className="dash-panel mission-bars">
          <WidgetTitle kicker="PASS-THROUGH" title="GPU / FPGA / smart-NIC utilisation" />
          <HorizontalBarCluster bars={passThroughBars} scale={100} />
        </article>

        <article className="dash-panel mission-fft">
          <WidgetTitle kicker="SPECTRUM" title="Network spectrum (DPDK)" trailing={<span className="osc-readout">64 channel FFT</span>} />
          <AnnotatedFft snapshot={telemetry} bars={64} height={160} freqLabels={['0', '125M', '250M', '500M', '1G', '2G', '4G']} />
        </article>

        <article className="dash-panel mission-pctile">
          <WidgetTitle kicker="PERCENTILES" title="Service-mesh latency bands" />
          <PercentileBar label="api.payments → ledger" p50={28} p95={62} p99={118} scale={200} />
          <PercentileBar label="api.payments → fraud" p50={42} p95={88} p99={142} scale={200} />
          <PercentileBar label="argocd → control-plane" p50={18} p95={36} p99={64} scale={200} />
          <PercentileBar label="prometheus → siem" p50={12} p95={28} p99={52} scale={200} />
        </article>

        <article className="dash-panel mission-stats">
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
      </div>
    </section>
  );
}

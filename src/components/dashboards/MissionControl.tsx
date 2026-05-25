import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import {
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildStorageDashboard,
} from '../../lib/dashboards';
import {
  FftBars,
  KpiTile,
  LiveEventFeed,
  MultiRingGauge,
  Oscilloscope,
  RouteMap,
  Sparkline,
  WidgetTitle,
  useRollingSeries,
} from './Widgets';

const networking = buildNetworkingDashboard();
const storage = buildStorageDashboard();
const machines = buildMachinesDashboard();

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
  const cpuSeries = useRollingSeries(telemetry?.cpuPercent ?? 58, 36, telemetry?.tick);
  const ramSeries = useRollingSeries(telemetry?.ramPercent ?? 64, 36, telemetry?.tick);
  const iopsSeries = useRollingSeries(telemetry ? telemetry.totalIops / 12_000 : 90, 36, telemetry?.tick);
  const wattsSeries = useRollingSeries(telemetry?.watts ?? 1592, 36, telemetry?.tick);
  const ingressSeries = useRollingSeries(telemetry ? telemetry.ingressMbps / 1000 : 78, 36, telemetry?.tick);
  const egressSeries = useRollingSeries(telemetry ? telemetry.egressMbps / 1000 : 75, 36, telemetry?.tick);

  const rings = useMemo(
    () => [
      { label: 'CPU pressure', value: telemetry?.cpuPercent ?? 58, color: 'accent' as const },
      { label: 'DRAM utilisation', value: telemetry?.ramPercent ?? 64, color: 'accent-2' as const },
      { label: 'IOPS saturation', value: telemetry ? Math.min(95, (telemetry.totalIops / 1_400_000) * 100) : 80, color: 'good' as const },
      { label: 'NIC RX vs egress', value: telemetry ? Math.min(95, (telemetry.ingressMbps / 110_000) * 100) : 71, color: 'warn' as const },
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
          <p>Unified live view of the synthetic Nexus environment — multi-ring posture, oscilloscope traces, route-map, and a streaming event log.</p>
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
        <KpiTile label="Migrations" value={`${telemetry?.activeMigrations ?? 3}`} delta={telemetry?.deltas.activeMigrations} hint="vMotion-style in-flight" status={(telemetry?.activeMigrations ?? 3) > 5 ? 'warn' : 'good'} />
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
        </article>

        <article className="dash-panel mission-osc">
          <WidgetTitle kicker="LIVE-WAVE" title="Oscilloscope · CPU / DRAM / NIC" />
          <Oscilloscope snapshot={telemetry} channels={3} height={220} label="t = 1.6s/div" />
        </article>

        <article className="dash-panel mission-map">
          <WidgetTitle kicker="ROUTE-MAP" title="Spatial cluster map" trailing={<span className="osc-readout">{networking.topology.nodes.length} nodes · {networking.topology.edges.length} routes</span>} />
          <RouteMap nodes={mapNodes} edges={mapEdges} snapshot={telemetry} />
        </article>

        <article className="dash-panel mission-feed">
          <WidgetTitle kicker="STREAM" title="Live event log" trailing={<span className="env-ticker-live">stream live</span>} />
          <LiveEventFeed snapshot={telemetry} height={220} maxLines={8} />
        </article>

        <article className="dash-panel mission-fft">
          <WidgetTitle kicker="SPECTRUM" title="Network spectrum (DPDK)" trailing={<span className="osc-readout">48 channel FFT</span>} />
          <FftBars snapshot={telemetry} bars={48} height={140} />
        </article>

        <article className="dash-panel mission-fleet">
          <WidgetTitle kicker="FLEET" title="Workload mix" trailing={<span className="osc-readout">{machines.fleet.length} active</span>} />
          <ul className="mission-fleet-list">
            {Object.entries(fleetByKind).map(([kind, count]) => (
              <li key={kind} className={`fleet-${kind}`}>
                <span className={`kind-chip kind-${kind}`}>{kind}</span>
                <strong>{count}</strong>
                <small>nodes pinned</small>
                <Sparkline values={Array.from({ length: 20 }, (_, i) => 40 + Math.sin((i + (telemetry?.tick ?? 0)) / 3) * 18 + Math.random() * 6)} height={28} />
              </li>
            ))}
          </ul>
          <div className="mission-fleet-summary">
            <KpiTile size="sm" label="Backends" value={`${storage.backends.length}`} hint="storage drivers" />
            <KpiTile size="sm" label="VLANs" value={`${networking.vlans.length}`} hint="bonded lanes" />
            <KpiTile size="sm" label="Mesh" value="3" hint="istio · linkerd · cilium" />
          </div>
        </article>
      </div>
    </section>
  );
}

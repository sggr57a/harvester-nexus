import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import type { ResourceMonitoring } from '../../lib/activeOperations';
import type { MachinesDashboard } from '../../lib/dashboards';
import type { TelemetryDataSource } from '../../lib/telemetry/dashboardAdapters';
import { withTelemetryFallbacks } from '../../lib/telemetry/effectiveTelemetry';
import {
  buildCity3DEdges,
  buildCity3DNodes,
  buildHudClusterModel,
  fmtK,
  fmtMb,
  fmtPct,
} from '../../lib/hudClusterModel';
import {
  AnnotatedOscilloscope,
  Cluster3DMap,
  ClusterRadar,
  KpiTile,
  RingMeterCluster,
  SparklineGrid,
  StackedAreaChart,
  useRollingSeries,
  VerticalMeterBank,
} from './Widgets';
import { HologramHudShell } from './HologramHudShell';
import { HardwareAddOnPanel, HardwareAddOnTotals } from './HardwareAddOnMetrics';
import {
  ConnectedColumnChart,
  HudEventStrip,
  HudHistoryMatrix,
  HudLinearBar,
  HudNodeTable,
  HudTile,
  HudWaveStrip,
} from './HologramHudWidgets';

interface ResourceMonitorHudViewProps {
  telemetry?: EnvironmentSnapshot;
  dataSource?: TelemetryDataSource;
  resourceMonitoring?: ResourceMonitoring;
  machinesDashboard?: MachinesDashboard;
}

export function ResourceMonitorHudView({
  telemetry,
  dataSource,
  resourceMonitoring,
  machinesDashboard,
}: ResourceMonitorHudViewProps) {
  const isLive = dataSource === 'live';
  const fleet = machinesDashboard?.fleet ?? [];
  const model = useMemo(
    () => buildHudClusterModel(fleet, telemetry, resourceMonitoring, { liveMode: isLive }),
    [fleet, telemetry, resourceMonitoring, isLive],
  );
  const effectiveTelemetry = useMemo(
    () => withTelemetryFallbacks(telemetry, model, { liveMode: isLive }),
    [telemetry, model, isLive],
  );

  const cpuSeries = useRollingSeries(effectiveTelemetry?.cpuPercent ?? model.nodes[0]?.cpu ?? 58, 48, effectiveTelemetry?.tick);
  const ramSeries = useRollingSeries(effectiveTelemetry?.ramPercent ?? model.nodes[0]?.ram ?? 64, 48, effectiveTelemetry?.tick);
  const netSeries = useRollingSeries(
    effectiveTelemetry ? effectiveTelemetry.ingressMbps / 100 : model.nodes[0]?.net ?? 40,
    48,
    effectiveTelemetry?.tick,
  );
  const diskSeries = useRollingSeries(
    effectiveTelemetry ? effectiveTelemetry.totalIops / 12000 : model.nodes[0]?.disk ?? 50,
    48,
    effectiveTelemetry?.tick,
  );
  const iopsSeries = useRollingSeries(effectiveTelemetry ? effectiveTelemetry.totalIops / 12000 : 90, 48, effectiveTelemetry?.tick);
  const txSeries = useRollingSeries(effectiveTelemetry ? effectiveTelemetry.egressMbps / 1000 : 75, 48, effectiveTelemetry?.tick);

  const burst = model.activity > 0.55;
  const mapNodes = buildCity3DNodes(model);
  const mapEdges = buildCity3DEdges(model);

  const radarNodes = useMemo(
    () =>
      model.nodes.map((node) => ({
        id: node.id,
        label: node.name,
        tier: node.name.startsWith('edge') ? ('edge' as const) : ('compute' as const),
        health: Math.max(40, 100 - node.cpu * 0.35),
        throughput: Math.round(node.net * 24),
        p95Ms: Math.round(8 + node.cpu * 0.2),
        errorPct: node.status === 'hot' ? 0.4 : 0.08,
        status: node.status === 'hot' ? ('watch' as const) : node.status === 'act' ? ('syncing' as const) : ('online' as const),
      })),
    [model.nodes],
  );

  const sparkItems = model.nodes.flatMap((node) => [
    { label: `${node.name} CPU`, values: cpuSeries.map((v) => v * (0.85 + node.cpu / 500)), current: node.cpu, unit: '%', status: node.cpu > 60 ? ('warn' as const) : ('good' as const) },
    { label: `${node.name} RAM`, values: ramSeries.map((v) => v * (0.9 + node.ram / 800)), current: node.ram, unit: '%' },
    { label: `${node.name} DSK`, values: diskSeries.map((v) => v * (0.8 + node.disk / 200)), current: node.disk * 220, unit: '' },
    { label: `${node.name} NET`, values: netSeries.map((v) => v * (0.75 + node.net / 150)), current: node.net * 12, unit: '' },
  ]);

  return (
    <section className="dash dash-hologram-hud" aria-label="Resource Monitor hologram HUD">
      <HologramHudShell>
      <header className="dash-header holo-header">
        <div>
          <span className="dash-kicker">RESOURCE MONITOR // HOLOGRAM HUD</span>
          <h2>Resource Monitor {isLive && <span className="holo-live-badge">LIVE</span>}</h2>
          <p>Cluster topology, per-node levels, wave strips, and rolling history — colors follow the active theme.</p>
        </div>
        <div className="dash-totals">
          <div><span>Nodes</span><strong>{model.nodes.length}</strong></div>
          <div><span>CPU</span><strong>{fmtPct(effectiveTelemetry?.cpuPercent ?? model.nodes[0]?.cpu ?? 0)}</strong></div>
          <div><span>Active ops</span><strong>{resourceMonitoring?.workItems.length ?? effectiveTelemetry?.activeMigrations ?? 0}</strong></div>
          <HardwareAddOnTotals summary={effectiveTelemetry?.accelerators} />
        </div>
      </header>

      {isLive && model.nodes.length === 0 && (
        <article className="dash-panel live-empty-panel">
          <p><strong>No cluster nodes in telemetry yet</strong></p>
          <small>
            Live mode shows Harvester nodes and user workloads only — not demo hosts like edge-a, compute-02, or payments-vm-01.
            Join or create a cluster, then deploy VMs or pods to tenant namespaces.
          </small>
        </article>
      )}

      <div className="holo-grid">
        <HudTile label="CPU" className="holo-gauge">
          <KpiTile label="CPU" value={fmtPct(effectiveTelemetry?.cpuPercent ?? 0)} size="sm" series={cpuSeries} status="good" />
        </HudTile>
        <HudTile label="RAM" className="holo-gauge">
          <KpiTile label="RAM" value={fmtPct(effectiveTelemetry?.ramPercent ?? 0)} size="sm" series={ramSeries} />
        </HudTile>
        <HudTile label="ACCEL" className="holo-gauge">
          <KpiTile
            label="ACCEL"
            value={String(effectiveTelemetry?.accelerators?.cards ?? 0)}
            unit="cards"
            size="sm"
            status={(effectiveTelemetry?.accelerators?.issues ?? 0) > 0 ? 'warn' : 'good'}
          />
        </HudTile>
        <HudTile label="DISK" className="holo-gauge">
          <KpiTile label="DSK" value={fmtK(effectiveTelemetry?.totalIops ?? 0)} unit="IOPS" size="sm" series={diskSeries} />
        </HudTile>
        <HudTile label="NET RX" className="holo-gauge">
          <KpiTile label="RX" value={fmtMb(effectiveTelemetry?.ingressMbps ?? 0)} size="sm" series={netSeries} status="warn" />
        </HudTile>
        <HudTile label="NET TX" className="holo-gauge">
          <KpiTile label="TX" value={fmtMb(effectiveTelemetry?.egressMbps ?? 0)} size="sm" series={txSeries} status="warn" />
        </HudTile>
        <HudTile label="Cluster event" className="holo-event" burst={burst}>
          <HudEventStrip title="CLUSTER EVENT" detail={model.eventLabel} />
        </HudTile>

        <HudTile label="Linear strip" className="holo-linear-row">
          <div className="holo-linear-grid">
            <HudLinearBar label="WL" value={effectiveTelemetry?.cpuPercent ?? 0} max={100} />
            <HudLinearBar label="MEM" value={effectiveTelemetry?.ramPercent ?? 0} max={100} tone="accent-2" />
            <HudLinearBar label="ACC" value={effectiveTelemetry?.accelerators?.hottestC ?? 0} max={100} tone="danger" />
            <HudLinearBar label="IO" value={effectiveTelemetry?.totalIops ?? 0} max={1_400_000} tone="good" />
            <HudLinearBar label="NET" value={effectiveTelemetry?.ingressMbps ?? 0} max={110_000} tone="warn" />
            <HudLinearBar label="IOPS" value={effectiveTelemetry?.totalIops ?? 0} max={1_400_000} tone="good" />
            <HudLinearBar label="Q" value={effectiveTelemetry?.cpuPercent ?? 0} max={100} />
            <HudLinearBar label="PWR" value={effectiveTelemetry?.watts ?? 0} max={2000} tone="danger" />
            <HudLinearBar label="TMP" value={effectiveTelemetry?.ramPercent ?? 0} max={100} tone="accent-2" />
          </div>
        </HudTile>

        <HudTile label="Wave · CPU" className="holo-wave">
          <HudWaveStrip title="CPU VIBRATION" values={cpuSeries} max={100} />
        </HudTile>
        <HudTile label="Wave · NET" className="holo-wave">
          <HudWaveStrip title="NET VIBRATION" values={netSeries} max={100} tone="warn" />
        </HudTile>
        <HudTile label="Virtual hologram · cluster topology" className="holo-hero" burst={burst} hero>
          <Cluster3DMap nodes={mapNodes} edges={mapEdges} snapshot={effectiveTelemetry} height={248} />
        </HudTile>
        <HudTile label="Level bank · CPU · disk · net" className="holo-level-bank">
          <VerticalMeterBank
            height={230}
            scale={100}
            meters={model.nodes.slice(0, 3).map((node) => ({
              label: node.name.slice(0, 6).toUpperCase(),
              value: node.cpu,
              unit: '%',
            }))}
          />
        </HudTile>

        <HudTile label="Radar · mix" className="holo-side-stack">
          <div className="holo-side-grid">
            <ClusterRadar nodes={radarNodes} snapshot={effectiveTelemetry} height={118} />
            <RingMeterCluster
              size={72}
              meters={[
                { label: 'CPU', value: effectiveTelemetry?.cpuPercent ?? 0 },
                { label: 'RAM', value: effectiveTelemetry?.ramPercent ?? 0 },
                { label: 'ACC', value: effectiveTelemetry?.accelerators?.hottestC ?? 0 },
              ]}
            />
          </div>
        </HudTile>
        <HudTile label="CPU cols" className="holo-col wide">
          <ConnectedColumnChart
            bars={model.nodes.map((node) => ({
              label: node.name.replace('compute-', 'h-'),
              value: node.cpu,
              max: 100,
              format: fmtPct,
            }))}
          />
        </HudTile>
        <HudTile label="Disk cols" className="holo-col wide">
          <ConnectedColumnChart
            bars={model.nodes.map((node) => ({
              label: node.name.replace('compute-', 'h-'),
              value: node.disk * 220,
              max: 22000,
              format: fmtK,
            }))}
          />
        </HudTile>
        <HudTile label="Net cols" className="holo-col">
          <ConnectedColumnChart
            bars={model.nodes.map((node) => ({
              label: node.name.replace('compute-', 'h-'),
              value: node.net * 12,
              max: 1200,
              format: fmtMb,
            }))}
          />
        </HudTile>

        <HudTile label="Stacked · CPU RAM disk net" className="holo-stack">
          <StackedAreaChart
            height={88}
            series={[
              { label: 'CPU', values: cpuSeries, color: 'var(--theme-accent)' },
              { label: 'RAM', values: ramSeries, color: 'var(--theme-accent-2)' },
              { label: 'IOPS', values: iopsSeries, color: 'var(--theme-good)' },
              { label: 'NET', values: netSeries, color: 'var(--theme-warn)' },
            ]}
          />
        </HudTile>

        <HudTile label="Multi-line telemetry" className="holo-lines">
          <AnnotatedOscilloscope
            height={98}
            channels={[
              { label: 'CPU', color: 'var(--theme-accent)', series: cpuSeries, unit: '%' },
              { label: 'RAM', color: 'var(--theme-accent-2)', series: ramSeries, unit: '%' },
            ]}
          />
        </HudTile>
        <HudTile label="Sparkline matrix" className="holo-spark">
          <SparklineGrid items={sparkItems.slice(0, 12)} columns={4} />
        </HudTile>

        <HudTile label="Historical histogram" className="holo-history" burst={model.activity > 0.65}>
          <HudHistoryMatrix
            rows={[
              { label: 'CPU cluster', values: cpuSeries, max: 100 },
              { label: 'RAM cluster', values: ramSeries, max: 100 },
              { label: 'NET cluster', values: netSeries, max: 100 },
            ]}
          />
        </HudTile>

        <HudTile label="Meter bank" className="holo-meters">
          <VerticalMeterBank
            height={130}
            scale={100}
            meters={fleet.slice(0, 6).map((row) => ({
              label: row.name.slice(0, 8),
              value: row.cpuPercent,
              unit: '%',
            }))}
          />
        </HudTile>
        <HudTile label="Live nodes" className="holo-table">
          <HudNodeTable
            columns={['Node', 'CPU', 'RAM', 'Disk', 'Net', 'Status']}
            rows={model.nodes.map((node) => ({
              hot: node.status === 'hot' || node.status === 'act',
              cells: [
                node.name,
                fmtPct(node.cpu),
                fmtPct(node.ram),
                fmtK(node.disk * 220),
                fmtMb(node.net * 12),
                node.status === 'hot' ? 'HOT' : node.status === 'act' ? 'ACT' : 'OK',
              ],
            }))}
          />
        </HudTile>
        <HudTile label="Add-in cards" className="holo-table holo-accel">
          <HardwareAddOnPanel summary={effectiveTelemetry?.accelerators} />
        </HudTile>
      </div>
      </HologramHudShell>
    </section>
  );
}

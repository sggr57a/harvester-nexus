import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import type { MachinesDashboard } from '../../lib/dashboards';
import { buildEnvironmentDashboard } from '../../lib/dashboards';
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
  MultiRingGauge,
  SparklineGrid,
  StackedAreaChart,
  useRollingSeries,
  VerticalMeterBank,
  WorldTrafficGlobe,
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

interface EnvironmentIntelHudViewProps {
  telemetry?: EnvironmentSnapshot;
  dataSource?: TelemetryDataSource;
  machinesDashboard?: MachinesDashboard;
}

const demoEnvironment = buildEnvironmentDashboard();

export function EnvironmentIntelHudView({
  telemetry,
  dataSource,
  machinesDashboard,
}: EnvironmentIntelHudViewProps) {
  const isLive = dataSource === 'live';
  const fleet = machinesDashboard?.fleet ?? [];
  const model = useMemo(() => buildHudClusterModel(fleet, telemetry, undefined, { liveMode: isLive }), [fleet, telemetry, isLive]);
  const effectiveTelemetry = useMemo(
    () => withTelemetryFallbacks(telemetry, model, { liveMode: isLive }),
    [telemetry, model, isLive],
  );

  const thermalSeries = useRollingSeries(model.nodes[0]?.cpu ?? effectiveTelemetry?.cpuPercent ?? 50, 48, effectiveTelemetry?.tick);
  const powerSeries = useRollingSeries(effectiveTelemetry?.watts ?? 1592, 48, effectiveTelemetry?.tick);
  const airSeries = useRollingSeries(
    effectiveTelemetry ? effectiveTelemetry.ingressMbps / 100 : model.nodes[0]?.net ?? 40,
    48,
    effectiveTelemetry?.tick,
  );
  const diskSeries = useRollingSeries(
    effectiveTelemetry ? effectiveTelemetry.totalIops / 12000 : 50,
    48,
    effectiveTelemetry?.tick,
  );
  const humSeries = useRollingSeries(effectiveTelemetry?.ramPercent ?? 43, 48, effectiveTelemetry?.tick);

  const burst = model.activity > 0.55;
  const mapNodes = buildCity3DNodes(model);
  const mapEdges = buildCity3DEdges(model);

  const eventDetail = isLive
    ? model.eventLabel
    : demoEnvironment.activity[0]?.label ?? model.eventLabel;

  const radarNodes = useMemo(
    () =>
      model.nodes.map((node) => ({
        id: node.id,
        label: node.name,
        tier: node.name.startsWith('edge') ? ('edge' as const) : ('compute' as const),
        health: Math.max(35, 100 - (node.thermalC - 30) * 2),
        throughput: Math.round(node.net * 24),
        p95Ms: Math.round(10 + node.thermalC * 0.3),
        errorPct: node.thermalC > 42 ? 0.35 : 0.06,
        status: node.thermalC > 42 ? ('watch' as const) : ('online' as const),
      })),
    [model.nodes],
  );

  const sparkItems = model.nodes.flatMap((node) => [
    { label: `${node.name} THM`, values: thermalSeries.map((v) => v * (0.9 + node.cpu / 400)), current: node.thermalC, unit: '°C', status: node.thermalC > 42 ? ('warn' as const) : ('good' as const) },
    { label: `${node.name} PWR`, values: powerSeries.map((v) => v * (0.7 + node.power / 3000)), current: node.power, unit: 'W' },
    { label: `${node.name} AIR`, values: airSeries.map((v) => v * (0.8 + node.net / 180)), current: node.net * 12, unit: '' },
    { label: `${node.name} DSK`, values: diskSeries.map((v) => v * (0.85 + node.disk / 220)), current: node.disk * 220, unit: '' },
  ]);

  const facilityEvents = isLive
    ? [{ time: 'live', label: model.eventLabel, detail: `${model.nodes.length} nodes monitored`, severity: 'info' as const }]
    : demoEnvironment.activity;

  return (
    <section className="dash dash-hologram-hud dash-environment-holo" aria-label="Environment Intel hologram HUD">
      <HologramHudShell>
      <header className="dash-header holo-header">
        <div>
          <span className="dash-kicker">ENVIRONMENT INTEL // HOLOGRAM HUD</span>
          <h2>Environment Intel {isLive && <span className="holo-live-badge">LIVE</span>}</h2>
          <p>Facility terrain mapped from cluster node thermals, power draw, and airflow — thermal scale uses theme-aware purple→red.</p>
        </div>
        <div className="dash-totals">
          <div><span>Avg °C</span><strong>{model.nodes.length ? Math.round(model.nodes.reduce((s, n) => s + n.thermalC, 0) / model.nodes.length) : 0}°</strong></div>
          <div><span>Power</span><strong>{Math.round(effectiveTelemetry?.watts ?? 0)}W</strong></div>
          <div><span>Airflow</span><strong>{fmtMb(effectiveTelemetry?.ingressMbps ?? 0)}</strong></div>
          <HardwareAddOnTotals summary={effectiveTelemetry?.accelerators} />
        </div>
      </header>

      <div className="holo-grid">
        <HudTile label="THERMAL" className="holo-gauge">
          <KpiTile
            label="THM"
            value={`${model.nodes[0]?.thermalC ?? 32}°`}
            size="sm"
            series={thermalSeries}
            status={model.nodes.some((n) => n.thermalC > 42) ? 'warn' : 'good'}
          />
        </HudTile>
        <HudTile label="POWER" className="holo-gauge">
          <KpiTile label="PWR" value={`${Math.round(effectiveTelemetry?.watts ?? 0)}`} unit="W" size="sm" series={powerSeries} />
        </HudTile>
        <HudTile label="AIRFLOW" className="holo-gauge">
          <KpiTile label="AIR" value={fmtMb(effectiveTelemetry?.ingressMbps ?? 0)} size="sm" series={airSeries} status="warn" />
        </HudTile>
        <HudTile label="DISK" className="holo-gauge">
          <KpiTile label="DSK" value={fmtK(effectiveTelemetry?.totalIops ?? 0)} unit="IOPS" size="sm" series={diskSeries} />
        </HudTile>
        <HudTile label="HUMIDITY" className="holo-gauge-sm">
          <KpiTile label="HUM" value={fmtPct(effectiveTelemetry?.ramPercent ?? 43)} size="sm" series={humSeries} />
        </HudTile>
        <HudTile label="ACCEL" className="holo-gauge-sm">
          <KpiTile
            label="ACCEL"
            value={effectiveTelemetry?.accelerators?.hottestC == null ? '—' : `${effectiveTelemetry.accelerators.hottestC}°`}
            size="sm"
            status={(effectiveTelemetry?.accelerators?.issues ?? 0) > 0 ? 'warn' : 'good'}
          />
        </HudTile>
        <HudTile label="Facility event" className="holo-event" burst={burst}>
          <HudEventStrip title="FACILITY EVENT" detail={eventDetail} />
        </HudTile>

        <HudTile label="Linear strip" className="holo-linear-row">
          <div className="holo-linear-grid">
            {model.nodes.slice(0, 3).map((node, i) => (
              <HudLinearBar key={node.id} label={`T${i + 1}`} value={node.thermalC} max={50} tone="danger" />
            ))}
            <HudLinearBar label="HUM" value={effectiveTelemetry?.ramPercent ?? 43} max={100} tone="accent-2" />
            <HudLinearBar label="IN" value={effectiveTelemetry?.ingressMbps ?? 0} max={110_000} tone="warn" />
            <HudLinearBar label="OUT" value={effectiveTelemetry?.egressMbps ?? 0} max={110_000} tone="danger" />
            <HudLinearBar label="CO2" value={effectiveTelemetry?.cpuPercent ?? 0} max={100} tone="good" />
            <HudLinearBar label="FAN" value={effectiveTelemetry?.ingressMbps ?? 0} max={110_000} tone="warn" />
          </div>
        </HudTile>

        <HudTile label="Wave · thermal" className="holo-wave">
          <HudWaveStrip title="THERMAL WAVE" values={thermalSeries} max={100} tone="danger" />
        </HudTile>
        <HudTile label="Wave · airflow" className="holo-wave">
          <HudWaveStrip title="AIRFLOW WAVE" values={airSeries} max={100} tone="warn" />
        </HudTile>
        <HudTile label="Virtual hologram · facility terrain" className="holo-hero" burst={burst} hero>
          <Cluster3DMap nodes={mapNodes} edges={mapEdges} snapshot={effectiveTelemetry} height={248} />
        </HudTile>
        <HudTile label="Level bank · thermal · power · air" className="holo-level-bank">
          <VerticalMeterBank
            thermal
            height={230}
            scale={100}
            meters={[
              { label: 'THM', value: model.nodes[0]?.cpu ?? 0, unit: '%' },
              { label: 'PWR', value: Math.min(100, (effectiveTelemetry?.watts ?? 0) / 20), unit: '%' },
              { label: 'AIR', value: model.nodes[0]?.net ?? 0, unit: '%' },
            ]}
          />
        </HudTile>

        <HudTile label="Globe · mix" className="holo-side-stack">
          <div className="holo-side-grid">
            <WorldTrafficGlobe height={118} />
            <MultiRingGauge
              size={118}
              rings={[
                { label: 'THM', value: model.nodes[0]?.cpu ?? 0, color: 'warn' },
                { label: 'PWR', value: Math.min(100, (effectiveTelemetry?.watts ?? 0) / 20), color: 'good' },
                { label: 'AIR', value: model.nodes[0]?.net ?? 0, color: 'accent' },
              ]}
            />
          </div>
        </HudTile>
        <HudTile label="Thermal radar" className="holo-radar">
          <ClusterRadar nodes={radarNodes} snapshot={effectiveTelemetry} height={118} />
        </HudTile>
        <HudTile label="Thermal cols" className="holo-col wide">
          <ConnectedColumnChart
            thermal
            bars={model.nodes.map((node) => ({
              label: node.name.replace('compute-', 'h-'),
              value: node.cpu,
              max: 100,
              format: (v) => `${Math.round(32 + v * 0.18)}°`,
            }))}
          />
        </HudTile>
        <HudTile label="Power cols" className="holo-col wide">
          <ConnectedColumnChart
            bars={model.nodes.map((node) => ({
              label: node.name.replace('compute-', 'h-'),
              value: node.power,
              max: 900,
              format: (v) => `${Math.round(v)}W`,
            }))}
          />
        </HudTile>

        <HudTile label="Facility stack" className="holo-stack">
          <StackedAreaChart
            height={88}
            series={[
              { label: 'IN', values: airSeries, color: 'var(--theme-warn)' },
              { label: 'OUT', values: airSeries.map((v) => v * 0.92), color: 'var(--theme-danger)' },
              { label: 'PWR', values: powerSeries.map((v) => v / 20), color: 'var(--theme-good)' },
            ]}
          />
        </HudTile>

        <HudTile label="Thermal · power · airflow" className="holo-lines">
          <AnnotatedOscilloscope
            height={98}
            channels={[
              { label: 'THM', color: 'var(--theme-warn)', series: thermalSeries, unit: '%' },
              { label: 'PWR', color: 'var(--theme-good)', series: powerSeries.map((v) => v / 20), unit: 'kW' },
              { label: 'AIR', color: 'var(--theme-accent)', series: airSeries, unit: 'Mb/s' },
            ]}
          />
        </HudTile>
        <HudTile label="Facility sparklines" className="holo-spark">
          <SparklineGrid items={sparkItems.slice(0, 12)} columns={4} />
        </HudTile>

        <HudTile label="Historical histogram" className="holo-history" burst={model.activity > 0.65}>
          <HudHistoryMatrix
            rows={[
              { label: 'THM h-01', values: thermalSeries, max: 100, thermal: true },
              { label: 'THM h-02', values: thermalSeries.map((v) => v * 0.96), max: 100, thermal: true },
              { label: 'PWR cluster', values: powerSeries.map((v) => v / 10), max: 200 },
            ]}
          />
        </HudTile>

        <HudTile label="Event rail" className="holo-events">
          <ul className="holo-event-rail">
            {facilityEvents.slice(0, 5).map((event) => (
              <li key={`${event.time}-${event.label}`} className={`sev-${event.severity}`}>
                <span>{event.time}</span>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
          </ul>
        </HudTile>
        <HudTile label="Facility nodes" className="holo-table wide">
          <HudNodeTable
            columns={['Node', '°C', 'Power', 'Airflow', 'Disk', 'CPU', 'Status']}
            rows={model.nodes.map((node) => ({
              hot: node.thermalC > 42 || node.status === 'act',
              cells: [
                node.name,
                `${node.thermalC}°C`,
                `${node.power}W`,
                fmtMb(node.net * 12),
                fmtK(node.disk * 220),
                fmtPct(node.cpu),
                node.thermalC > 42 ? 'WARM' : node.status === 'act' ? 'ACT' : 'OK',
              ],
            }))}
          />
        </HudTile>
        <HudTile label="Add-in cards" className="holo-table wide">
          <HardwareAddOnPanel summary={effectiveTelemetry?.accelerators} />
        </HudTile>
      </div>
      </HologramHudShell>
    </section>
  );
}

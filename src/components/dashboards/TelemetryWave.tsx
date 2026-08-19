import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import { buildAccelerationDashboard } from '../../lib/dashboards';
import {
  AnnotatedFft,
  AnnotatedLatencyHistogram,
  AnnotatedOscilloscope,
  DialGauge,
  HorizontalBarCluster,
  KpiTile,
  PercentileBar,
  StatGrid,
  StatReadouts,
  VerticalMeterBank,
  WidgetTitle,
  computeStats,
  useRollingSeries,
} from './Widgets';

import type { TelemetryDataSource } from '../../lib/telemetry/dashboardAdapters';
import { DemoCatalogPlaceholder } from './LiveEmptyPanel';
import { HardwareAddOnPanel, HardwareAddOnTotals } from './HardwareAddOnMetrics';
import { StorageIopsPanel, StorageIopsTotals } from './StorageIopsMetrics';
import { formatMetric } from '../../lib/telemetry/environmentAdapter';

const accel = buildAccelerationDashboard();

interface TelemetryWaveProps {
  telemetry?: EnvironmentSnapshot;
  dataSource?: TelemetryDataSource;
}

function buildWave(seed: number, length: number, base: number, amp: number, jitter = 4): number[] {
  return Array.from({ length }, (_, idx) => {
    const phase = (seed + idx) / 4;
    return Math.max(2, Math.min(100, base + Math.sin(phase) * amp + Math.sin(phase * 1.7 + seed * 0.3) * (amp * 0.4) + (Math.random() * 2 - 1) * jitter));
  });
}

export function TelemetryWaveView({ telemetry, dataSource }: TelemetryWaveProps = {}) {
  if (dataSource === 'live') {
    return <DemoCatalogPlaceholder viewName="Telemetry Wave" dataSource={dataSource} />;
  }

  const seed = telemetry?.tick ?? 0;

  const dpdkChannels = useMemo(
    () => [
      { label: 'storage-bo', color: 'var(--theme-accent)', series: buildWave(seed, 64, telemetry ? telemetry.ingressMbps / 1500 : 55, 16), unit: '%' },
      { label: 'workload-bo', color: 'var(--theme-accent-2)', series: buildWave(seed + 4, 64, telemetry ? telemetry.egressMbps / 1500 : 48, 14), unit: '%' },
      { label: 'rdma-bo', color: 'var(--theme-good)', series: buildWave(seed + 8, 64, 42, 18), unit: '%' },
    ],
    [seed, telemetry],
  );

  const spdkChannels = useMemo(
    () => [
      { label: 'nvme-of-rdma', color: 'var(--theme-good)', series: buildWave(seed + 1, 64, 78, 14), unit: '%' },
      { label: 'nvme-of-tcp', color: 'var(--theme-accent)', series: buildWave(seed + 5, 64, 62, 18), unit: '%' },
      { label: 'vitastor', color: 'var(--theme-accent-2)', series: buildWave(seed + 9, 64, 55, 22), unit: '%' },
      { label: 'ceph', color: 'var(--theme-warn)', series: buildWave(seed + 13, 64, 41, 12), unit: '%' },
    ],
    [seed],
  );

  const vhostChannels = useMemo(
    () => [
      { label: 'kubevirt', color: 'var(--theme-accent)', series: buildWave(seed + 2, 64, telemetry?.cpuPercent ?? 58, 12), unit: '%' },
      { label: 'incus', color: 'var(--theme-accent-2)', series: buildWave(seed + 6, 64, 42, 14), unit: '%' },
    ],
    [seed, telemetry],
  );

  const ingressRolling = useRollingSeries(telemetry ? telemetry.ingressMbps / 1000 : 78, 48, telemetry?.tick);
  const iopsRolling = useRollingSeries(telemetry ? telemetry.totalIops / 14_000 : 80, 48, telemetry?.tick);

  const histograms = useMemo(() => {
    const shape = (mean: number, p50Idx: number, p95Idx: number, p99Idx: number) => {
      const base = [4, 12, 24, 38, 56, 42, 22, 10, 3];
      return base.map((v, idx) => {
        const adjustment = idx === Math.floor(mean) ? 1.15 : 1;
        const value = Math.round(v * adjustment + (Math.random() * 4 - 2));
        let highlight: 'mean' | 'p50' | 'p95' | 'p99' | undefined;
        if (idx === Math.floor(mean)) highlight = 'mean';
        else if (idx === p50Idx) highlight = 'p50';
        else if (idx === p95Idx) highlight = 'p95';
        else if (idx === p99Idx) highlight = 'p99';
        return { label: ['<1µs', '1-2', '2-4', '4-8', '8-16', '16-32', '32-64', '64-128', '128µs+'][idx], value, highlight };
      });
    };
    return {
      rdma: shape(4, 4, 6, 7),
      tcp: shape(4, 4, 6, 7),
      vhost: shape(4, 5, 6, 7),
    };
  }, [seed]);

  const dpdkMeters = useMemo(
    () =>
      accel.dpdkPorts.map((port) => ({
        label: port.port.split(' ')[0],
        value: Math.min(99, Math.max(15, port.loadPercent + (((seed + port.port.length) * 3) % 20) - 10)),
        unit: '%',
        threshold: 80,
      })),
    [seed],
  );

  const spdkBars = useMemo(
    () =>
      accel.spdkLanes.map((lane) => ({
        label: lane.lane.split(' //')[0],
        value: Math.round(lane.throughputGiBs * 10) / 10,
        unit: ' GiB/s',
        detail: `qd ${lane.queueDepth} · ${lane.latencyMicros}µs`,
        status:
          lane.latencyMicros < 12 ? ('good' as const) : lane.latencyMicros < 20 ? ('warn' as const) : ('danger' as const),
      })),
    [],
  );

  return (
    <section className="dash dash-telemetry-wave" aria-label="Telemetry Wave dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">SIGNAL // TELEMETRY-WAVE</span>
          <h2>Telemetry Wave</h2>
          <p>Annotated oscilloscope traces with per-channel MIN/AVG/MAX/NOW readouts, frequency-axis FFT spectrum, mean+P50/P95/P99 latency histograms with summary callouts, percentile bands, vertical level meters, and SPDK lane bar clusters.</p>
        </div>
        <div className="dash-totals">
          <div><span>SPDK lanes</span><strong>{accel.spdkLanes.length}</strong></div>
          <div><span>DPDK ports</span><strong>{accel.dpdkPorts.length}</strong></div>
          <div><span>Pass-thru</span><strong>{telemetry?.accelerators?.cards ?? accel.passThrough.length}</strong></div>
          <div><span>Sample rate</span><strong>1.6 s/div</strong></div>
          <HardwareAddOnTotals summary={telemetry?.accelerators} />
          <StorageIopsTotals summary={telemetry?.storageIops} />
        </div>
      </header>

      <div className="wave-stat-strip">
        <StatGrid
          columns={9}
          items={[
            { label: 'NIC RX', value: telemetry ? (telemetry.ingressMbps / 1000).toFixed(1) : '78.4', unit: 'Gb/s', delta: telemetry ? telemetry.deltas.ingressMbps / 1000 : 0, status: 'good' },
            { label: 'NIC TX', value: telemetry ? (telemetry.egressMbps / 1000).toFixed(1) : '74.8', unit: 'Gb/s', delta: telemetry ? telemetry.deltas.egressMbps / 1000 : 0, status: 'good' },
            { label: 'IOPS', value: formatMetric(telemetry, 'totalIops', (v) => (v / 1000).toFixed(0), '1120'), unit: 'K', delta: telemetry && !telemetry.unavailableMetrics?.includes('totalIops') ? telemetry.deltas.totalIops / 1000 : 0, status: 'good' },
            { label: 'CPU', value: `${telemetry?.cpuPercent ?? 58}`, unit: '%', delta: telemetry?.deltas.cpuPercent, status: 'neutral' },
            { label: 'DRAM', value: `${telemetry?.ramPercent ?? 64}`, unit: '%', delta: telemetry?.deltas.ramPercent, status: 'neutral' },
            { label: 'ACCEL', value: `${telemetry?.accelerators?.cards ?? accel.passThrough.length}`, unit: 'cards', status: (telemetry?.accelerators?.issues ?? 0) > 0 ? 'warn' : 'good' },
            { label: 'PWR', value: `${telemetry?.watts ?? 1592}`, unit: 'W', delta: telemetry?.deltas.watts },
            { label: 'MIG', value: `${telemetry?.activeMigrations ?? 3}`, hint: 'in-flight' },
            { label: 'TICK', value: telemetry?.tick ?? 0, hint: '1.6s sweep' },
          ]}
        />
      </div>

      <div className="wave-row wave-row-3">
        <article className="dash-panel wave-osc-panel">
          <WidgetTitle kicker="DPDK" title="Polled-mode ring buffers" trailing={<span className="osc-readout">{(telemetry ? telemetry.ingressMbps / 1000 : 78.4).toFixed(1)} Gb/s</span>} />
          <AnnotatedOscilloscope channels={dpdkChannels} snapshot={telemetry} height={210} divisionsX={10} divisionsY={8} timeScale="1.6 s / div" voltScale="12.5 % / div" />
        </article>
        <article className="dash-panel wave-osc-panel">
          <WidgetTitle kicker="SPDK" title="Userspace NVMe-oF queues" trailing={<span className="osc-readout">{formatMetric(telemetry, 'totalIops', (v) => `${(v / 1000).toFixed(0)}K`, '1120K')} IOPS</span>} />
          <AnnotatedOscilloscope channels={spdkChannels} snapshot={telemetry} height={210} divisionsX={10} divisionsY={8} timeScale="1.6 s / div" voltScale="queue-util" />
        </article>
        <article className="dash-panel wave-osc-panel">
          <WidgetTitle kicker="VHOST-USER" title="L2/L3 fast path traces" trailing={<span className="osc-readout">{telemetry?.cpuPercent ?? 58}% CPU</span>} />
          <AnnotatedOscilloscope channels={vhostChannels} snapshot={telemetry} height={210} divisionsX={10} divisionsY={8} />
        </article>
      </div>

      <div className="wave-row wave-row-2">
        <article className="dash-panel">
          <WidgetTitle kicker="SPECTRUM" title="DPDK 64-bin FFT · frequency response" trailing={<span className="osc-readout">peak hold</span>} />
          <AnnotatedFft snapshot={telemetry} bars={64} height={170} freqLabels={['0', '125 MHz', '250 MHz', '500 MHz', '1 GHz', '2 GHz', '4 GHz']} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="SPECTRUM" title="SPDK 48-bin FFT · queue power" trailing={<span className="osc-readout">peak hold</span>} />
          <AnnotatedFft snapshot={telemetry ? { ...telemetry, tick: telemetry.tick + 7 } : telemetry} bars={48} height={170} freqLabels={['idle', '500/s', '1k/s', '5k/s', '20k/s', '100k/s', '1M/s']} />
        </article>
      </div>

      <div className="wave-row wave-row-3">
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="NVMe-oF / RDMA histogram" trailing={<span className="osc-readout">9 buckets</span>} />
          <AnnotatedLatencyHistogram buckets={histograms.rdma} summary={{ mean: '6 µs', p50: '8 µs', p95: '32 µs', p99: '64 µs' }} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="NVMe-oF / TCP histogram" trailing={<span className="osc-readout">9 buckets</span>} />
          <AnnotatedLatencyHistogram buckets={histograms.tcp} summary={{ mean: '14 µs', p50: '12 µs', p95: '48 µs', p99: '96 µs' }} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="vhost-user histogram" trailing={<span className="osc-readout">9 buckets</span>} />
          <AnnotatedLatencyHistogram buckets={histograms.vhost} summary={{ mean: '12 µs', p50: '10 µs', p95: '32 µs', p99: '64 µs' }} />
        </article>
      </div>

      <div className="wave-row wave-row-3">
        <article className="dash-panel">
          <WidgetTitle kicker="PERCENTILES" title="Storage path latency bands" />
          <PercentileBar label="Ceph RBD" p50={42} p95={120} p99={210} scale={300} />
          <PercentileBar label="Longhorn" p50={58} p95={142} p99={240} scale={300} />
          <PercentileBar label="NVMe-oF TCP" p50={18} p95={48} p99={96} scale={300} />
          <PercentileBar label="NVMe-oF RDMA" p50={7} p95={22} p99={48} scale={300} />
          <PercentileBar label="Vitastor (SPDK)" p50={12} p95={32} p99={72} scale={300} />
        </article>

        <article className="dash-panel">
          <WidgetTitle kicker="DPDK LANES" title="Port load level meters" trailing={<span className="osc-readout">{accel.dpdkPorts.length} ports</span>} />
          <VerticalMeterBank meters={dpdkMeters} height={210} scale={100} />
          <StatReadouts stats={computeStats(ingressRolling)} unit=" Gb" compact />
        </article>

        <article className="dash-panel">
          <WidgetTitle kicker="DIAL CLUSTER" title="Fast-path dial gauges" />
          <div className="wave-dial-grid">
            <DialGauge value={telemetry ? Math.min(100, (telemetry.ingressMbps / 110_000) * 100) : 71} label="NIC RX" unit="%" status="good" bands={[{ from: 0, to: 60, color: 'var(--theme-good)' }, { from: 60, to: 85, color: 'var(--theme-warn)' }, { from: 85, to: 100, color: 'var(--theme-danger)' }]} />
            <DialGauge value={telemetry ? Math.min(100, (telemetry.totalIops / 1_400_000) * 100) : 80} label="IOPS" unit="%" status="good" />
            <DialGauge value={accel.spdkLanes.reduce((s, l) => s + l.throughputGiBs, 0)} max={60} label="SPDK GB/s" unit="" status="good" />
            <DialGauge value={accel.dpdkPorts.reduce((s, p) => s + p.loadPercent, 0) / accel.dpdkPorts.length} max={100} label="DPDK avg" unit="%" status="warn" />
          </div>
        </article>
      </div>

      <article className="dash-panel">
        <WidgetTitle kicker="LANES" title="SPDK userspace lanes · live KPI" />
        <div className="wave-lane-grid">
          {accel.spdkLanes.map((lane, idx) => {
            const drift = (seed + idx * 3) % 9;
            return (
              <KpiTile
                key={lane.lane}
                label={lane.lane}
                value={`${(lane.throughputGiBs + drift / 5).toFixed(1)}`}
                unit="GiB/s"
                hint={`qd ${lane.queueDepth} · ${lane.latencyMicros + (drift % 4)}µs`}
                series={Array.from({ length: 22 }, (_, i) => 50 + Math.sin((i + seed) / 2 + idx) * 18 + Math.random() * 6)}
                status={lane.latencyMicros < 12 ? 'good' : 'warn'}
              />
            );
          })}
        </div>
      </article>

      <article className="dash-panel">
        <WidgetTitle kicker="THROUGHPUT" title="SPDK lane throughput ranking" trailing={<span className="osc-readout">GiB/s</span>} />
        <HorizontalBarCluster bars={spdkBars} />
      </article>

      <article className="dash-panel">
        <WidgetTitle kicker="ROLLING" title="Rolling 48-sample windows · ingress &amp; IOPS" />
        <div className="wave-rolling-grid">
          <div>
            <h4>NIC ingress (Gb/s)</h4>
            <AnnotatedOscilloscope channels={[{ label: 'ingress', color: 'var(--theme-accent)', series: ingressRolling.map((v) => Math.min(100, v)), unit: 'G' }]} snapshot={telemetry} height={130} divisionsX={12} divisionsY={6} />
          </div>
          <div>
            <h4>Aggregate IOPS (·14k)</h4>
            <AnnotatedOscilloscope channels={[{ label: 'iops', color: 'var(--theme-good)', series: iopsRolling, unit: '' }]} snapshot={telemetry} height={130} divisionsX={12} divisionsY={6} />
          </div>
        </div>
      </article>

      <HardwareAddOnPanel summary={telemetry?.accelerators} />
      <StorageIopsPanel summary={telemetry?.storageIops} />
    </section>
  );
}

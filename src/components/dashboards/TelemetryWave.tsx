import { useMemo } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import { buildAccelerationDashboard } from '../../lib/dashboards';
import {
  FftBars,
  KpiTile,
  LatencyHistogram,
  Oscilloscope,
  Sparkline,
  WidgetTitle,
  useRollingSeries,
} from './Widgets';

const accel = buildAccelerationDashboard();

interface TelemetryWaveProps {
  telemetry?: EnvironmentSnapshot;
}

export function TelemetryWaveView({ telemetry }: TelemetryWaveProps = {}) {
  const seed = telemetry?.tick ?? 0;

  const histograms = useMemo(() => {
    const baseShape = (peak: number, p95Index: number) =>
      [
        { label: '<1µs', value: 6 },
        { label: '1-2µs', value: 14 },
        { label: '2-4µs', value: 28 },
        { label: '4-8µs', value: peak },
        { label: '8-16µs', value: 42 },
        { label: '16-32µs', value: 22 },
        { label: '32-64µs', value: 12, highlight: 'p95' as const },
        { label: '64-128µs', value: 6, highlight: 'p99' as const },
        { label: '128µs+', value: 2 },
      ].map((bucket, idx) => (idx === p95Index ? { ...bucket, highlight: 'p50' as const } : bucket));
    return {
      spdkRdma: baseShape(60 + (seed % 8), 3),
      spdkTcp: baseShape(46 + (seed % 12), 4),
      vhostUser: baseShape(40 + (seed % 6), 4),
    };
  }, [seed]);

  const dpdkSeries = useRollingSeries(telemetry ? telemetry.ingressMbps / 800 : 90, 36, telemetry?.tick);
  const spdkSeries = useRollingSeries(telemetry ? telemetry.totalIops / 14_000 : 80, 36, telemetry?.tick);
  const vhostSeries = useRollingSeries(telemetry ? telemetry.cpuPercent + 10 : 64, 36, telemetry?.tick);

  return (
    <section className="dash dash-telemetry-wave" aria-label="Telemetry Wave dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">SIGNAL // TELEMETRY-WAVE</span>
          <h2>Telemetry Wave</h2>
          <p>High-density oscilloscope traces, FFT spectrum bands, and rolling latency histograms across the SPDK / DPDK / vhost-user / RDMA fast paths.</p>
        </div>
        <div className="dash-totals">
          <div><span>SPDK lanes</span><strong>{accel.spdkLanes.length}</strong></div>
          <div><span>DPDK ports</span><strong>{accel.dpdkPorts.length}</strong></div>
          <div><span>Sample rate</span><strong>1.6s/div</strong></div>
        </div>
      </header>

      <div className="wave-row wave-row-3">
        <article className="dash-panel wave-osc">
          <WidgetTitle kicker="DPDK" title="Polled-mode ring buffers" trailing={<span className="osc-readout">{(telemetry ? telemetry.ingressMbps / 1000 : 78.4).toFixed(1)} Gb/s</span>} />
          <Oscilloscope snapshot={telemetry} channels={2} height={180} label="ch1: storage-bo · ch2: workload-bo" />
          <Sparkline values={dpdkSeries} height={32} />
        </article>
        <article className="dash-panel wave-osc">
          <WidgetTitle kicker="SPDK" title="Userspace NVMe-oF queues" trailing={<span className="osc-readout">{telemetry ? `${(telemetry.totalIops / 1000).toFixed(0)}K` : '1120K'} IOPS</span>} />
          <Oscilloscope snapshot={telemetry} channels={3} height={180} label="ch1-3: nvme-of-rdma · nvme-of-tcp · vitastor" />
          <Sparkline values={spdkSeries} height={32} />
        </article>
        <article className="dash-panel wave-osc">
          <WidgetTitle kicker="VHOST-USER" title="L2/L3 fast path traces" trailing={<span className="osc-readout">{telemetry?.cpuPercent ?? 58}% CPU</span>} />
          <Oscilloscope snapshot={telemetry} channels={2} height={180} label="ch1: kubevirt · ch2: incus" />
          <Sparkline values={vhostSeries} height={32} />
        </article>
      </div>

      <div className="wave-row wave-row-2">
        <article className="dash-panel">
          <WidgetTitle kicker="SPECTRUM" title="DPDK 48-bin FFT" trailing={<span className="osc-readout">live</span>} />
          <FftBars snapshot={telemetry} bars={48} height={150} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="SPECTRUM" title="Storage 32-bin FFT" trailing={<span className="osc-readout">live</span>} />
          <FftBars snapshot={telemetry ? { ...telemetry, tick: telemetry.tick + 7 } : telemetry} bars={32} height={150} />
        </article>
      </div>

      <div className="wave-row wave-row-3">
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="NVMe-oF / RDMA histogram" trailing={<span className="osc-readout">p50/p95/p99</span>} />
          <LatencyHistogram buckets={histograms.spdkRdma} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="NVMe-oF / TCP histogram" />
          <LatencyHistogram buckets={histograms.spdkTcp} />
        </article>
        <article className="dash-panel">
          <WidgetTitle kicker="LATENCY" title="vhost-user histogram" />
          <LatencyHistogram buckets={histograms.vhostUser} />
        </article>
      </div>

      <article className="dash-panel">
        <WidgetTitle kicker="LANES" title="SPDK userspace lanes (live)" />
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
                series={Array.from({ length: 18 }, (_, i) => 50 + Math.sin((i + seed) / 2 + idx) * 18 + Math.random() * 6)}
                status={lane.latencyMicros < 12 ? 'good' : 'warn'}
              />
            );
          })}
        </div>
      </article>
    </section>
  );
}

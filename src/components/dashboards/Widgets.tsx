import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';

/* ============================================================
   Advanced reusable widgets used by Mission Control and
   Telemetry Wave dashboards. Every widget is purely SVG /
   CSS-driven, picks its colors from --theme-* CSS variables,
   and accepts a live `EnvironmentSnapshot` so the visuals
   animate on every tick.
   ============================================================ */

interface WidgetTitleProps {
  kicker?: string;
  title: string;
  trailing?: ReactNode;
}

export function WidgetTitle({ kicker, title, trailing }: WidgetTitleProps) {
  return (
    <div className="widget-title">
      <div>
        {kicker && <span className="widget-kicker">{kicker}</span>}
        <strong>{title}</strong>
      </div>
      {trailing && <div className="widget-trailing">{trailing}</div>}
    </div>
  );
}

/* -------------------- Sparkline -------------------- */

interface SparklineProps {
  values: number[];
  height?: number;
  fill?: boolean;
  className?: string;
}

export function Sparkline({ values, height = 28, fill = true, className }: SparklineProps) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 90 - 5;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className={`spark ${className ?? ''}`.trim()} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polyline className="spark-fill" points={`0,100 ${points} 100,100`} fill="url(#spark-fill)" />}
      <polyline className="spark-line" points={points} fill="none" />
      <circle className="spark-tip" cx="100" cy={100 - ((values[values.length - 1] - min) / range) * 90 - 5} r="1.6" />
    </svg>
  );
}

/* -------------------- KPI tile with sparkline + delta -------------------- */

interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  series?: number[];
  hint?: string;
  status?: 'good' | 'warn' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function KpiTile({ label, value, unit, delta, series, hint, status, size = 'md' }: KpiTileProps) {
  const deltaClass = delta !== undefined ? (delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat') : '';
  return (
    <article className={`kpi-tile size-${size} status-${status ?? 'neutral'}`}>
      <span className="kpi-label">{label}</span>
      <div className="kpi-value">
        <strong>{value}</strong>
        {unit && <span>{unit}</span>}
      </div>
      {(delta !== undefined || hint) && (
        <div className={`kpi-meta ${deltaClass}`}>
          {delta !== undefined && (
            <span className="kpi-delta">
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}
            </span>
          )}
          {hint && <small>{hint}</small>}
        </div>
      )}
      {series && series.length > 1 && (
        <div className="kpi-spark">
          <Sparkline values={series} />
        </div>
      )}
      <i className="kpi-corner kpi-corner-tl" />
      <i className="kpi-corner kpi-corner-tr" />
      <i className="kpi-corner kpi-corner-bl" />
      <i className="kpi-corner kpi-corner-br" />
    </article>
  );
}

/* -------------------- Multi-ring radial gauge -------------------- */

interface RadialRing {
  label: string;
  value: number; // 0-100
  color?: 'accent' | 'accent-2' | 'good' | 'warn' | 'danger';
}

interface MultiRingGaugeProps {
  rings: RadialRing[];
  centerLabel?: string;
  centerValue?: string;
  centerSub?: string;
  size?: number;
}

export function MultiRingGauge({ rings, centerLabel, centerValue, centerSub, size = 220 }: MultiRingGaugeProps) {
  const cx = 50;
  const cy = 50;
  const baseRadius = 16;
  const stroke = 4.4;
  const ringSpacing = 6.2;

  return (
    <div className="multi-ring-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="ring-bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="46" fill="url(#ring-bg-glow)" />
        {/* tick marks */}
        {Array.from({ length: 36 }).map((_, idx) => {
          const angle = (idx / 36) * Math.PI * 2 - Math.PI / 2;
          const r1 = 44;
          const r2 = idx % 9 === 0 ? 39 : 42;
          return (
            <line
              key={idx}
              x1={cx + Math.cos(angle) * r1}
              y1={cy + Math.sin(angle) * r1}
              x2={cx + Math.cos(angle) * r2}
              y2={cy + Math.sin(angle) * r2}
              stroke="var(--theme-grid)"
              strokeWidth={idx % 9 === 0 ? 0.6 : 0.3}
            />
          );
        })}
        {rings.map((ring, idx) => {
          const r = baseRadius + idx * ringSpacing;
          const c = 2 * Math.PI * r;
          const offset = c * (1 - Math.max(0, Math.min(100, ring.value)) / 100);
          const colorVar = `var(--theme-${ring.color ?? 'accent'})`;
          return (
            <g key={ring.label} className={`ring-group ring-${idx}`}>
              <circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                stroke={colorVar}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${c}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ filter: `drop-shadow(0 0 4px ${colorVar}) drop-shadow(0 0 10px ${colorVar})` }}
              />
            </g>
          );
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="multi-ring-center">
          {centerLabel && <span>{centerLabel}</span>}
          {centerValue && <strong>{centerValue}</strong>}
          {centerSub && <small>{centerSub}</small>}
        </div>
      )}
      <ul className="multi-ring-legend">
        {rings.map((ring) => (
          <li key={ring.label} className={`legend-${ring.color ?? 'accent'}`}>
            <i />
            <span>{ring.label}</span>
            <b>{Math.round(ring.value)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------- Oscilloscope (live waveform) -------------------- */

interface OscilloscopeProps {
  /** Optional series; if not provided, the widget generates and animates its own series tied to the snapshot. */
  series?: number[];
  /** Live snapshot that drives the oscilloscope when `series` is omitted. */
  snapshot?: EnvironmentSnapshot;
  channels?: number;
  height?: number;
  label?: string;
}

function buildWaveSeries(seed: number, length: number, amp: number, base: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const phase = (seed + i) / 6;
    const value = base + Math.sin(phase) * amp + Math.sin(phase * 1.7 + seed * 0.3) * (amp * 0.4) + (Math.random() * 4 - 2);
    out.push(value);
  }
  return out;
}

export function Oscilloscope({ series, snapshot, channels = 3, height = 180, label }: OscilloscopeProps) {
  const seed = snapshot?.tick ?? 0;

  const channelSeries = useMemo(() => {
    if (series) return [series];
    const base = snapshot ? [snapshot.cpuPercent, snapshot.ramPercent, Math.min(95, snapshot.ingressMbps / 1100)] : [60, 55, 50];
    const amps = [16, 12, 22];
    return Array.from({ length: channels }, (_, idx) => buildWaveSeries(seed * 4 + idx * 9, 100, amps[idx % amps.length], base[idx % base.length]));
  }, [series, snapshot, channels, seed]);

  const colors = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)'];

  return (
    <div className="oscilloscope" style={{ height }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="osc-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="var(--theme-grid)" strokeWidth="0.3" />
          </pattern>
          <linearGradient id="osc-fade" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0" />
            <stop offset="20%" stopColor="var(--theme-accent)" stopOpacity="0.7" />
            <stop offset="80%" stopColor="var(--theme-accent)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="200" height="100" fill="url(#osc-grid)" opacity="0.6" />
        <line x1="0" y1="50" x2="200" y2="50" stroke="var(--theme-accent-soft)" strokeWidth="0.4" strokeDasharray="2 2" />
        {channelSeries.map((channel, channelIdx) => {
          const points = channel.map((value, i) => `${(i / (channel.length - 1)) * 200},${100 - Math.max(2, Math.min(98, value))}`).join(' ');
          const color = colors[channelIdx % colors.length];
          return (
            <g key={channelIdx} className={`osc-channel channel-${channelIdx}`}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="0.7" opacity="0.25" style={{ filter: `blur(2px)` }} />
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="0.85"
                style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }}
              />
            </g>
          );
        })}
        {/* sweep cursor */}
        <line x1="195" y1="0" x2="195" y2="100" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.7">
          <animate attributeName="x1" values="0;200" dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="x2" values="0;200" dur="3.2s" repeatCount="indefinite" />
        </line>
      </svg>
      {label && <span className="osc-label">{label}</span>}
      <div className="osc-readout">
        <span style={{ color: colors[0] }}>CH1 {channelSeries[0]?.[channelSeries[0].length - 1].toFixed(1)}</span>
        {channelSeries[1] && <span style={{ color: colors[1] }}>CH2 {channelSeries[1]?.[channelSeries[1].length - 1].toFixed(1)}</span>}
        {channelSeries[2] && <span style={{ color: colors[2] }}>CH3 {channelSeries[2]?.[channelSeries[2].length - 1].toFixed(1)}</span>}
      </div>
    </div>
  );
}

/* -------------------- FFT-like frequency bars -------------------- */

interface FftBarsProps {
  snapshot?: EnvironmentSnapshot;
  bars?: number;
  height?: number;
}

export function FftBars({ snapshot, bars = 48, height = 140 }: FftBarsProps) {
  const seed = snapshot?.tick ?? 0;
  const values = useMemo(() => {
    return Array.from({ length: bars }, (_, idx) => {
      const phase = (seed + idx) / 4;
      const decay = 1 - idx / bars;
      const v = (Math.sin(phase * 1.4 + idx * 0.3) * 0.4 + Math.sin(phase * 0.7 + idx * 0.12) * 0.5 + 0.5) * decay * 100;
      return Math.max(8, Math.min(98, Math.round(v + (Math.random() * 8 - 4))));
    });
  }, [seed, bars]);
  const max = Math.max(...values);
  return (
    <div className="fft-bars" style={{ height }}>
      {values.map((value, idx) => {
        const peak = (value / max) * 100;
        return (
          <span key={idx} className="fft-bar" style={{ height: `${peak}%`, animationDelay: `${idx * 18}ms` } as CSSProperties}>
            <i style={{ height: `${peak}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/* -------------------- Latency histogram (P50/P95/P99) -------------------- */

interface HistogramProps {
  buckets: { label: string; value: number; highlight?: 'p50' | 'p95' | 'p99' }[];
  height?: number;
}

export function LatencyHistogram({ buckets, height = 130 }: HistogramProps) {
  const max = Math.max(...buckets.map((b) => b.value));
  return (
    <div className="lat-histogram" style={{ height }}>
      {buckets.map((bucket) => {
        const pct = (bucket.value / max) * 100;
        return (
          <div key={bucket.label} className={`lat-col ${bucket.highlight ? `is-${bucket.highlight}` : ''}`}>
            <div className="lat-bar">
              <i style={{ height: `${pct}%` }} />
              {bucket.highlight && <em>{bucket.highlight.toUpperCase()}</em>}
            </div>
            <small>{bucket.label}</small>
            <b>{bucket.value}</b>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Spatial route map -------------------- */

interface RouteMapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'online' | 'syncing' | 'watch' | 'draining';
  load: number;
  kind: 'control' | 'compute' | 'storage' | 'edge' | 'vcluster';
}

interface RouteMapEdge {
  from: string;
  to: string;
  channel: 'mgmt' | 'storage' | 'mesh' | 'vm' | 'gitops';
  load: number;
}

interface RouteMapProps {
  nodes: RouteMapNode[];
  edges: RouteMapEdge[];
  snapshot?: EnvironmentSnapshot;
}

function curveBetween(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const mx = ax + dx / 2 + dy * 0.18;
  const my = ay + dy / 2 - dx * 0.18;
  return `M${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

export function RouteMap({ nodes, edges, snapshot }: RouteMapProps) {
  const map = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const seed = snapshot?.tick ?? 0;
  return (
    <div className="route-map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="route-map-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="var(--theme-grid)" strokeWidth="0.18" />
          </pattern>
          <radialGradient id="route-map-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#route-map-bg)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#route-map-grid)" />
        {/* concentric reference circles */}
        {[20, 32, 44].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--theme-accent-soft)" strokeWidth="0.18" strokeDasharray="0.6 1.2" />
        ))}
        {/* edges */}
        {edges.map((edge, idx) => {
          const a = map.get(edge.from);
          const b = map.get(edge.to);
          if (!a || !b) return null;
          return (
            <g key={`${edge.from}-${edge.to}-${idx}`} className={`map-edge channel-${edge.channel}`}>
              <path d={curveBetween(a.x, a.y, b.x, b.y)} stroke={`var(--theme-channel-${edge.channel})`} strokeWidth="0.6" fill="none" opacity="0.32" />
              <path
                d={curveBetween(a.x, a.y, b.x, b.y)}
                stroke={`var(--theme-channel-${edge.channel})`}
                strokeWidth="1"
                fill="none"
                strokeDasharray="2 4"
                style={{ filter: `drop-shadow(0 0 3px var(--theme-channel-${edge.channel}))` }}
              >
                <animate attributeName="stroke-dashoffset" values="0;-12" dur={`${3 + (idx % 3)}s`} repeatCount="indefinite" />
              </path>
              {/* travelling particle */}
              <circle r="0.7" fill={`var(--theme-channel-${edge.channel})`}>
                <animateMotion dur={`${4 + (idx % 4)}s`} repeatCount="indefinite" path={curveBetween(a.x, a.y, b.x, b.y)} begin={`${idx * 0.3}s`} />
              </circle>
            </g>
          );
        })}
        {/* nodes */}
        {nodes.map((node) => {
          const offset = (Math.sin((seed + node.x) / 4) + 1) * 1.2;
          return (
            <g key={node.id} className={`map-node kind-${node.kind} status-${node.status}`} transform={`translate(${node.x} ${node.y})`}>
              <circle r={3 + offset} className="map-node-halo" />
              <circle r="2.4" className="map-node-ring" />
              <circle r="1.2" className="map-node-core" />
              <text y="-3.6" textAnchor="middle" className="map-node-label">{node.label}</text>
              <text y="5" textAnchor="middle" className="map-node-load">{node.load}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------- Live event feed (terminal-style log) -------------------- */

interface FeedItem {
  id: string;
  timestamp: string;
  channel: string;
  message: string;
  severity: 'info' | 'ok' | 'warn' | 'critical';
}

const baseFeed: Omit<FeedItem, 'id' | 'timestamp'>[] = [
  { channel: 'POLY-COMPUTE', message: 'kubevirt://payments-vm-02 live-migration committed → compute-03', severity: 'ok' },
  { channel: 'STORAGE', message: 'vitastor: queue depth 128 saturated, scaling SPDK lane to 256', severity: 'info' },
  { channel: 'MESH', message: 'cilium ebpf rerouting api.payments → backup endpoint (38ms p95)', severity: 'info' },
  { channel: 'GITOPS', message: 'argocd: synced platform/observability rev 7f3a2c1', severity: 'ok' },
  { channel: 'SECURITY', message: 'siem: failed login burst on 10.10.40.144 — auto-throttled', severity: 'warn' },
  { channel: 'DPDK', message: 'storage-bo (200G) load 84% · 28.8 Mpps · burst 64', severity: 'info' },
  { channel: 'GPU-PT', message: 'gpu-a100-2 → training-sandbox util 92% (mdev driver)', severity: 'ok' },
  { channel: 'COMPLIANCE', message: 'BSI Grundschutz hardening 82% (168/204 controls)', severity: 'info' },
  { channel: 'ACCEL', message: '1 GiB hugepages reservation: 64/64 honoured by KubeVirt', severity: 'ok' },
  { channel: 'NETWORK', message: 'rdma-bo degraded — initiating bond reconciliation', severity: 'warn' },
  { channel: 'CVE', message: 'critical CVE bucket -2 (3 → 1) after image rollout', severity: 'critical' },
  { channel: 'BACKUP', message: 'pbs-primary: edge-a verified ok · 18m / 60m RPO', severity: 'ok' },
];

interface LiveEventFeedProps {
  snapshot?: EnvironmentSnapshot;
  height?: number;
  maxLines?: number;
}

export function LiveEventFeed({ snapshot, height = 220, maxLines = 8 }: LiveEventFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(() =>
    baseFeed.slice(0, maxLines).map((item, idx) => ({
      ...item,
      id: `seed-${idx}`,
      timestamp: new Date(Date.now() - (maxLines - idx) * 1500).toLocaleTimeString('en-GB', { hour12: false }),
    })),
  );
  const lastTickRef = useRef<number>(snapshot?.tick ?? 0);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.tick === lastTickRef.current) return;
    lastTickRef.current = snapshot.tick;
    const candidate = baseFeed[(snapshot.tick * 3) % baseFeed.length];
    const newItem: FeedItem = {
      id: `tick-${snapshot.tick}`,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      ...candidate,
    };
    setItems((prev) => [newItem, ...prev].slice(0, maxLines));
  }, [snapshot, maxLines]);

  return (
    <ul className="live-event-feed" style={{ height }}>
      {items.map((item, idx) => (
        <li key={item.id} className={`feed-item sev-${item.severity}`} style={{ animationDelay: `${idx * 35}ms` }}>
          <span className="feed-time">{item.timestamp}</span>
          <span className="feed-channel">{item.channel}</span>
          <span className="feed-message">{item.message}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------- Helper: build a derived series from a single live value -------------------- */

export function useRollingSeries(value: number, length = 32, key?: string | number): number[] {
  const ref = useRef<number[]>([]);
  const lastKeyRef = useRef<string | number | undefined>(undefined);
  if (key !== undefined && key !== lastKeyRef.current) {
    lastKeyRef.current = key;
    ref.current = [...ref.current, value].slice(-length);
  } else if (ref.current.length === 0) {
    ref.current = Array.from({ length }, () => value);
  }
  return ref.current;
}

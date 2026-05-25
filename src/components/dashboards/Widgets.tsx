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

/* -------------------- Stat helpers -------------------- */

export interface SeriesStats {
  min: number;
  max: number;
  avg: number;
  peak: number;
  current: number;
  p50: number;
  p95: number;
  p99: number;
}

export function computeStats(values: number[]): SeriesStats {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, peak: 0, current: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const pick = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    peak: sorted[sorted.length - 1],
    avg: sum / values.length,
    current: values[values.length - 1],
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
  };
}

export interface StatReadoutsProps {
  stats: SeriesStats;
  unit?: string;
  compact?: boolean;
  includeP99?: boolean;
}

/** Inline grid of MIN / AVG / MAX / PEAK / P95 readouts used across HUD widgets. */
export function StatReadouts({ stats, unit, compact = false, includeP99 = false }: StatReadoutsProps) {
  const fmt = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(compact ? 1 : 2));
  return (
    <div className={`stat-readouts ${compact ? 'is-compact' : ''}`}>
      <div><span>MIN</span><strong>{fmt(stats.min)}{unit && <em>{unit}</em>}</strong></div>
      <div><span>AVG</span><strong>{fmt(stats.avg)}{unit && <em>{unit}</em>}</strong></div>
      <div><span>MAX</span><strong>{fmt(stats.max)}{unit && <em>{unit}</em>}</strong></div>
      <div><span>P95</span><strong>{fmt(stats.p95)}{unit && <em>{unit}</em>}</strong></div>
      {includeP99 && <div><span>P99</span><strong>{fmt(stats.p99)}{unit && <em>{unit}</em>}</strong></div>}
      <div className="readout-cur"><span>NOW</span><strong>{fmt(stats.current)}{unit && <em>{unit}</em>}</strong></div>
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

/* -------------------- Stacked area chart (multi-series time-series, condensed) -------------------- */

interface StackedAreaSeries {
  label: string;
  values: number[];
  color?: string;
}

interface StackedAreaChartProps {
  series: StackedAreaSeries[];
  height?: number;
  yMax?: number;
  xLabels?: string[];
}

/** Stacked area chart — each series adds onto the previous. Useful for
 * showing how a total breaks down between contributors over time
 * (workload mix, traffic by VLAN, IOPS by backend, etc.). */
export function StackedAreaChart({ series, height = 140, yMax, xLabels }: StackedAreaChartProps) {
  if (series.length === 0 || series[0].values.length === 0) return null;
  const len = series[0].values.length;
  // Compute cumulative stacks
  const cumulative: number[][] = series.reduce<number[][]>((acc, s, idx) => {
    const prev = acc[idx - 1];
    acc.push(s.values.map((v, i) => v + (prev ? prev[i] : 0)));
    return acc;
  }, []);
  const max = yMax ?? Math.max(...cumulative[cumulative.length - 1]);
  const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-danger)', 'var(--theme-channel-gitops)'];
  return (
    <div className="stacked-area-chart" style={{ height }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {series.map((_, idx) => (
            <linearGradient key={idx} id={`stack-grad-${idx}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={series[idx].color ?? palette[idx % palette.length]} stopOpacity="0.7" />
              <stop offset="100%" stopColor={series[idx].color ?? palette[idx % palette.length]} stopOpacity="0.1" />
            </linearGradient>
          ))}
        </defs>
        {/* axis grid */}
        {Array.from({ length: 5 }).map((_, idx) => (
          <line key={idx} x1="0" y1={(idx / 4) * 100} x2="200" y2={(idx / 4) * 100} stroke="var(--theme-grid)" strokeWidth="0.3" opacity="0.5" />
        ))}
        {/* bottom-up stacking */}
        {[...cumulative].reverse().map((cum, reverseIdx) => {
          const idx = cumulative.length - 1 - reverseIdx;
          const color = series[idx].color ?? palette[idx % palette.length];
          const points = cum.map((v, i) => `${(i / (len - 1)) * 200},${100 - (v / max) * 100}`).join(' ');
          return (
            <g key={idx}>
              <polygon points={`0,100 ${points} 200,100`} fill={`url(#stack-grad-${idx})`} stroke={color} strokeWidth="0.5" opacity="0.9" />
            </g>
          );
        })}
      </svg>
      <div className="stacked-area-legend">
        {series.map((s, idx) => {
          const color = s.color ?? palette[idx % palette.length];
          return (
            <span key={s.label}>
              <i style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
              {s.label}
              <b>{s.values[s.values.length - 1].toFixed(0)}</b>
            </span>
          );
        })}
      </div>
      {xLabels && (
        <div className="stacked-area-xaxis">
          {xLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      )}
    </div>
  );
}

/* -------------------- Sankey-style flow widget (left → right ribbons) -------------------- */

interface FlowNode {
  id: string;
  label: string;
  value: number;
  side: 'left' | 'right';
  color?: string;
}

interface FlowLink {
  from: string;
  to: string;
  value: number;
  label?: string;
}

interface FlowDiagramProps {
  nodes: FlowNode[];
  links: FlowLink[];
  height?: number;
}

/** Compact Sankey-style ribbon flow showing how units of activity flow from
 * one set of categories (left side) to another (right side). Examples:
 * source-VLAN → destination-service, workload-kind → backend, etc. */
export function FlowDiagram({ nodes, links, height = 200 }: FlowDiagramProps) {
  const leftNodes = nodes.filter((n) => n.side === 'left');
  const rightNodes = nodes.filter((n) => n.side === 'right');
  const totalLeft = leftNodes.reduce((sum, n) => sum + n.value, 0);
  const totalRight = rightNodes.reduce((sum, n) => sum + n.value, 0);
  const leftPositions = useMemo(() => {
    let cursor = 0;
    return leftNodes.map((n) => {
      const heightUnits = (n.value / Math.max(totalLeft, 1)) * 100;
      const y = cursor + heightUnits / 2;
      cursor += heightUnits + 1;
      return { ...n, y, h: heightUnits };
    });
  }, [leftNodes, totalLeft]);
  const rightPositions = useMemo(() => {
    let cursor = 0;
    return rightNodes.map((n) => {
      const heightUnits = (n.value / Math.max(totalRight, 1)) * 100;
      const y = cursor + heightUnits / 2;
      cursor += heightUnits + 1;
      return { ...n, y, h: heightUnits };
    });
  }, [rightNodes, totalRight]);
  const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-channel-gitops)'];
  return (
    <div className="flow-diagram" style={{ height }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {leftPositions.map((n, idx) => (
            <linearGradient key={n.id} id={`flow-grad-${n.id}`} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor={n.color ?? palette[idx % palette.length]} stopOpacity="0.55" />
              <stop offset="100%" stopColor={n.color ?? palette[idx % palette.length]} stopOpacity="0.18" />
            </linearGradient>
          ))}
        </defs>
        {/* Links */}
        {links.map((link, idx) => {
          const from = leftPositions.find((n) => n.id === link.from);
          const to = rightPositions.find((n) => n.id === link.to);
          if (!from || !to) return null;
          const linkHeight = Math.max(0.6, (link.value / Math.max(totalLeft, 1)) * 80);
          const yFrom = from.y;
          const yTo = to.y;
          const fromColor = from.color ?? palette[leftPositions.indexOf(from) % palette.length];
          return (
            <path
              key={`${link.from}-${link.to}-${idx}`}
              d={`M 22 ${yFrom - linkHeight / 2} C 100 ${yFrom - linkHeight / 2}, 100 ${yTo - linkHeight / 2}, 178 ${yTo - linkHeight / 2} L 178 ${yTo + linkHeight / 2} C 100 ${yTo + linkHeight / 2}, 100 ${yFrom + linkHeight / 2}, 22 ${yFrom + linkHeight / 2} Z`}
              fill={`url(#flow-grad-${from.id})`}
              opacity={0.85}
            >
              <animate attributeName="opacity" values="0.55;0.95;0.55" dur="3.2s" repeatCount="indefinite" begin={`${idx * 0.2}s`} />
            </path>
          );
        })}
        {/* Left node bars */}
        {leftPositions.map((n, idx) => {
          const color = n.color ?? palette[idx % palette.length];
          return (
            <g key={n.id}>
              <rect x="18" y={n.y - n.h / 2} width="4" height={n.h} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
              <text x="14" y={n.y + 1.5} textAnchor="end" className="flow-label">{n.label}</text>
              <text x="14" y={n.y + 4.5} textAnchor="end" className="flow-value">{n.value}</text>
            </g>
          );
        })}
        {/* Right node bars */}
        {rightPositions.map((n, idx) => {
          const color = n.color ?? palette[idx % palette.length];
          return (
            <g key={n.id}>
              <rect x="178" y={n.y - n.h / 2} width="4" height={n.h} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
              <text x="186" y={n.y + 1.5} textAnchor="start" className="flow-label">{n.label}</text>
              <text x="186" y={n.y + 4.5} textAnchor="start" className="flow-value">{n.value}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------- World traffic map: shooting trajectories + Iron Man info panels -------------------- */

interface TrafficSource {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  ip: string;
  host: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT';
  status: 200 | 201 | 204 | 301 | 401 | 403 | 404 | 500 | 502;
  bytes: number;
  rps: number;
  kind: 'ingress' | 'auth' | 'replication' | 'sync' | 'scan' | 'backup';
}

const DEFAULT_SOURCES: TrafficSource[] = [
  { id: 'tokyo', city: 'Tokyo', country: 'JP', lat: 35.7, lng: 139.7, ip: '203.0.113.18', host: 'api.payments.nexus.local', method: 'POST', status: 201, bytes: 18420, rps: 482, kind: 'ingress' },
  { id: 'nyc', city: 'New York', country: 'US', lat: 40.7, lng: -74.0, ip: '198.51.100.42', host: 'console.nexus.local', method: 'GET', status: 200, bytes: 9120, rps: 234, kind: 'ingress' },
  { id: 'london', city: 'London', country: 'UK', lat: 51.5, lng: -0.1, ip: '203.0.113.84', host: 'argocd.nexus.local', method: 'POST', status: 200, bytes: 12480, rps: 38, kind: 'sync' },
  { id: 'mumbai', city: 'Mumbai', country: 'IN', lat: 19.1, lng: 72.9, ip: '198.51.100.219', host: 'metrics.nexus.local', method: 'GET', status: 200, bytes: 4860, rps: 96, kind: 'scan' },
  { id: 'sydney', city: 'Sydney', country: 'AU', lat: -33.9, lng: 151.2, ip: '203.0.113.140', host: 'edge-b.nexus.local', method: 'CONNECT', status: 200, bytes: 64280, rps: 12, kind: 'replication' },
  { id: 'sao_paulo', city: 'São Paulo', country: 'BR', lat: -23.5, lng: -46.6, ip: '198.51.100.7', host: 'api.payments.nexus.local', method: 'POST', status: 401, bytes: 2240, rps: 18, kind: 'auth' },
  { id: 'sg', city: 'Singapore', country: 'SG', lat: 1.4, lng: 103.8, ip: '203.0.113.22', host: 'api.fraud.nexus.local', method: 'POST', status: 200, bytes: 8420, rps: 142, kind: 'ingress' },
  { id: 'dubai', city: 'Dubai', country: 'AE', lat: 25.3, lng: 55.3, ip: '198.51.100.198', host: 'console.nexus.local', method: 'GET', status: 403, bytes: 1120, rps: 4, kind: 'auth' },
  { id: 'toronto', city: 'Toronto', country: 'CA', lat: 43.7, lng: -79.4, ip: '203.0.113.61', host: 'pbs.nexus.local', method: 'PUT', status: 200, bytes: 128420, rps: 6, kind: 'backup' },
  { id: 'capetown', city: 'Cape Town', country: 'ZA', lat: -33.9, lng: 18.4, ip: '198.51.100.151', host: 'edge-a.nexus.local', method: 'CONNECT', status: 200, bytes: 38420, rps: 8, kind: 'replication' },
];

// Frankfurt — system VIP / cluster home
const SYSTEM_HOME = { city: 'FRANKFURT', country: 'DE', lat: 50.1, lng: 8.7 };

/** Equirectangular projection: lng/lat -> SVG coords (viewBox 0 0 360 180). */
function projectGeo(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * 360;
  const y = ((90 - lat) / 180) * 180;
  return [x, y];
}

/** Simplified country outlines — every country is rendered as a small polygon
 * positioned at its real geographic centre on the equirectangular projection.
 * All countries render faded / ghostly by default; the widget brightens any
 * country that matches an active source or threat country-code. The shapes are
 * deliberately rough quadrilaterals so the file stays compact, but the rough
 * geographic positioning is enough to read at a glance. */
const COUNTRIES: { code: string; name: string; d: string }[] = [
  { code: 'US', name: 'United States', d: 'M 24 50 L 88 48 L 92 56 L 90 70 L 70 70 L 60 64 L 28 60 Z' },
  { code: 'CA', name: 'Canada', d: 'M 18 24 L 96 22 L 102 36 L 98 48 L 88 48 L 24 50 L 24 38 Z' },
  { code: 'MX', name: 'Mexico', d: 'M 60 64 L 76 64 L 82 70 L 76 78 L 64 78 L 60 70 Z' },
  { code: 'BR', name: 'Brazil', d: 'M 102 100 L 122 102 L 128 116 L 124 132 L 116 138 L 108 130 L 100 116 Z' },
  { code: 'AR', name: 'Argentina', d: 'M 108 138 L 122 138 L 122 152 L 116 162 L 110 154 Z' },
  { code: 'CL', name: 'Chile', d: 'M 100 120 L 106 120 L 112 152 L 108 164 L 102 156 Z' },
  { code: 'PE', name: 'Peru', d: 'M 92 110 L 102 108 L 102 124 L 96 122 Z' },
  { code: 'CO', name: 'Colombia', d: 'M 92 96 L 102 96 L 104 106 L 96 108 Z' },
  { code: 'VE', name: 'Venezuela', d: 'M 100 92 L 112 90 L 112 100 L 104 100 Z' },
  { code: 'UK', name: 'United Kingdom', d: 'M 170 46 L 180 44 L 182 56 L 174 58 Z' },
  { code: 'IE', name: 'Ireland', d: 'M 164 50 L 170 48 L 170 56 L 164 56 Z' },
  { code: 'FR', name: 'France', d: 'M 174 56 L 188 54 L 190 64 L 178 66 Z' },
  { code: 'ES', name: 'Spain', d: 'M 170 64 L 184 62 L 184 70 L 174 72 Z' },
  { code: 'PT', name: 'Portugal', d: 'M 168 64 L 174 64 L 174 70 L 168 72 Z' },
  { code: 'DE', name: 'Germany', d: 'M 184 50 L 196 48 L 196 58 L 186 60 Z' },
  { code: 'IT', name: 'Italy', d: 'M 188 58 L 200 58 L 200 70 L 192 72 Z' },
  { code: 'NL', name: 'Netherlands', d: 'M 184 48 L 190 47 L 190 52 L 184 53 Z' },
  { code: 'PL', name: 'Poland', d: 'M 196 48 L 208 47 L 208 56 L 198 56 Z' },
  { code: 'SE', name: 'Sweden', d: 'M 192 24 L 204 24 L 206 44 L 196 46 Z' },
  { code: 'NO', name: 'Norway', d: 'M 186 22 L 200 20 L 202 40 L 192 42 Z' },
  { code: 'FI', name: 'Finland', d: 'M 204 22 L 218 22 L 218 42 L 206 42 Z' },
  { code: 'RU', name: 'Russia', d: 'M 198 22 L 350 18 L 350 50 L 218 50 L 208 44 Z' },
  { code: 'UA', name: 'Ukraine', d: 'M 200 54 L 220 54 L 220 64 L 204 64 Z' },
  { code: 'TR', name: 'Türkiye', d: 'M 200 64 L 224 64 L 226 72 L 204 74 Z' },
  { code: 'IL', name: 'Israel', d: 'M 210 76 L 213 75 L 213 80 L 210 81 Z' },
  { code: 'EG', name: 'Egypt', d: 'M 204 76 L 218 76 L 218 86 L 206 86 Z' },
  { code: 'SA', name: 'Saudi Arabia', d: 'M 214 78 L 234 78 L 234 92 L 218 92 Z' },
  { code: 'AE', name: 'United Arab Emirates', d: 'M 232 84 L 240 84 L 240 90 L 232 90 Z' },
  { code: 'IR', name: 'Iran', d: 'M 224 64 L 244 64 L 244 78 L 226 78 Z' },
  { code: 'PK', name: 'Pakistan', d: 'M 240 70 L 252 70 L 252 80 L 242 80 Z' },
  { code: 'IN', name: 'India', d: 'M 244 76 L 264 76 L 268 92 L 252 102 L 246 92 Z' },
  { code: 'CN', name: 'China', d: 'M 248 50 L 308 48 L 314 70 L 270 76 L 252 70 Z' },
  { code: 'KP', name: 'North Korea', d: 'M 296 50 L 304 50 L 304 58 L 296 58 Z' },
  { code: 'KR', name: 'South Korea', d: 'M 296 58 L 304 58 L 304 64 L 296 64 Z' },
  { code: 'JP', name: 'Japan', d: 'M 308 50 L 320 48 L 324 64 L 314 70 Z' },
  { code: 'TW', name: 'Taiwan', d: 'M 296 72 L 302 72 L 302 76 L 296 76 Z' },
  { code: 'TH', name: 'Thailand', d: 'M 274 80 L 284 80 L 286 92 L 276 90 Z' },
  { code: 'VN', name: 'Vietnam', d: 'M 282 80 L 290 80 L 292 92 L 284 92 Z' },
  { code: 'MY', name: 'Malaysia', d: 'M 274 92 L 290 92 L 290 96 L 276 96 Z' },
  { code: 'SG', name: 'Singapore', d: 'M 282 90 L 285 90 L 285 92 L 282 92 Z' },
  { code: 'ID', name: 'Indonesia', d: 'M 268 96 L 318 96 L 318 102 L 274 104 Z' },
  { code: 'PH', name: 'Philippines', d: 'M 296 80 L 306 80 L 306 92 L 298 92 Z' },
  { code: 'AU', name: 'Australia', d: 'M 286 122 L 326 120 L 332 134 L 318 144 L 292 142 L 286 132 Z' },
  { code: 'NZ', name: 'New Zealand', d: 'M 332 144 L 340 144 L 342 156 L 334 156 Z' },
  { code: 'NG', name: 'Nigeria', d: 'M 184 90 L 196 90 L 198 100 L 188 100 Z' },
  { code: 'KE', name: 'Kenya', d: 'M 210 100 L 220 100 L 220 110 L 212 110 Z' },
  { code: 'ZA', name: 'South Africa', d: 'M 196 124 L 214 122 L 218 134 L 208 138 L 198 134 Z' },
  { code: 'MA', name: 'Morocco', d: 'M 168 70 L 180 70 L 180 80 L 170 80 Z' },
  { code: 'DZ', name: 'Algeria', d: 'M 180 70 L 198 70 L 198 84 L 184 84 Z' },
  { code: 'IS', name: 'Iceland', d: 'M 162 30 L 172 30 L 172 38 L 162 38 Z' },
];

/** Simplified world continents — fallback ghostly silhouettes underneath the
 * country polygons so the world still reads as a unified shape even where
 * we don't have country detail. Equirectangular, viewBox 0 0 360 180. */
const CONTINENT_PATHS: { id: string; d: string }[] = [
  // North America
  { id: 'n-america', d: 'M 24 48 L 38 36 L 56 30 L 72 32 L 80 38 L 90 38 L 96 44 L 96 52 L 102 60 L 104 70 L 100 78 L 88 86 L 80 96 L 76 110 L 70 120 L 62 122 L 56 116 L 50 116 L 44 110 L 36 102 L 30 92 L 28 80 L 22 70 L 18 56 Z' },
  // Greenland (small detail)
  { id: 'greenland', d: 'M 100 32 L 110 32 L 116 38 L 116 48 L 108 52 L 100 50 L 96 42 Z' },
  // South America
  { id: 's-america', d: 'M 96 110 L 108 108 L 118 116 L 122 130 L 126 140 L 128 154 L 122 166 L 114 166 L 106 154 L 100 142 L 96 128 Z' },
  // Europe
  { id: 'europe', d: 'M 168 50 L 178 44 L 188 40 L 200 42 L 210 48 L 212 56 L 206 62 L 196 64 L 184 64 L 174 60 L 168 56 Z' },
  // Africa
  { id: 'africa', d: 'M 178 68 L 192 64 L 208 64 L 216 72 L 222 84 L 224 96 L 224 110 L 218 124 L 210 134 L 200 138 L 192 134 L 184 124 L 178 110 L 174 92 L 174 76 Z' },
  // Asia
  { id: 'asia', d: 'M 212 36 L 232 30 L 252 28 L 272 30 L 290 34 L 304 42 L 314 50 L 316 60 L 308 66 L 296 70 L 282 70 L 272 76 L 260 78 L 252 86 L 244 96 L 236 96 L 228 90 L 220 80 L 216 70 L 212 56 Z' },
  // SE Asia / India peninsula
  { id: 'india', d: 'M 244 76 L 256 76 L 260 86 L 256 98 L 248 100 L 244 92 Z' },
  // Australia
  { id: 'australia', d: 'M 286 124 L 308 122 L 320 130 L 322 140 L 314 146 L 298 146 L 286 138 Z' },
  // Antarctica band
  { id: 'antarctica', d: 'M 0 174 L 360 174 L 360 180 L 0 180 Z' },
];

interface WorldTrafficGlobeProps {
  snapshot?: EnvironmentSnapshot;
  sources?: TrafficSource[];
  /** Number of source panels to keep visible at any moment. */
  visiblePanels?: number;
  height?: number;
}

const KIND_COLORS: Record<TrafficSource['kind'], string> = {
  ingress: 'var(--theme-accent)',
  auth: 'var(--theme-warn)',
  replication: 'var(--theme-good)',
  sync: 'var(--theme-accent-2)',
  scan: 'var(--theme-channel-mesh, var(--theme-accent-2))',
  backup: 'var(--theme-channel-gitops, var(--theme-accent-2))',
};

const STATUS_TONE = (status: number) =>
  status >= 500 ? 'danger' : status >= 400 ? 'warn' : status >= 300 ? 'info' : 'good';

/** Big animated world traffic map. Each second, a rolling sub-set of country
 * sources is "active" — their info panel unfolds with IP / host / method /
 * status / bytes / RPS (Iron Man HUD style), and an animated trajectory arcs
 * from the country to the system center (Frankfurt). Travelling glow particles
 * along each arc give the live feel.
 *
 * @deprecated Used as a small map; the new `ThreatIntelMap` is the hero panel
 *             and provides full MDR/XDR threat overlay, city-lights, and
 *             side-panel intelligence feeds.
 */
export function WorldTrafficGlobe({
  snapshot,
  sources = DEFAULT_SOURCES,
  visiblePanels = 5,
  height = 360,
}: WorldTrafficGlobeProps) {
  const seed = snapshot?.tick ?? 0;
  const homeProj = projectGeo(SYSTEM_HOME.lat, SYSTEM_HOME.lng);
  // Cycle which sources have a panel unfolded — uses the live tick for rotation
  const activeIds = useMemo(() => {
    const ids: string[] = [];
    for (let i = 0; i < visiblePanels; i += 1) {
      ids.push(sources[(seed + i * 3) % sources.length].id);
    }
    return new Set(ids);
  }, [seed, sources, visiblePanels]);

  // Project all sources once
  const projected = useMemo(
    () => sources.map((src) => ({ src, point: projectGeo(src.lat, src.lng) })),
    [sources],
  );

  return (
    <div className="world-traffic-globe" style={{ height }}>
      <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="world-bg-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.4" />
            <stop offset="60%" stopColor="var(--theme-accent-soft)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
          <pattern id="world-graticule" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--theme-grid)" strokeWidth="0.25" />
          </pattern>
        </defs>
        {/* Background glow + graticule */}
        <rect x="0" y="0" width="360" height="180" fill="url(#world-bg-glow)" />
        <rect x="0" y="0" width="360" height="180" fill="url(#world-graticule)" opacity="0.55" />
        {/* Equator line */}
        <line x1="0" y1="90" x2="360" y2="90" stroke="var(--theme-accent)" strokeWidth="0.3" strokeDasharray="2 3" opacity="0.4" />
        {/* Continents */}
        {CONTINENT_PATHS.map((c) => (
          <g key={c.id} className={`continent continent-${c.id}`}>
            <path d={c.d} fill="var(--theme-accent-soft)" fillOpacity="0.4" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.7" />
            <path d={c.d} fill="none" stroke="var(--theme-accent)" strokeWidth="0.25" opacity="0.5" style={{ filter: 'drop-shadow(0 0 3px var(--theme-accent))' }} />
          </g>
        ))}
        {/* System home halo (Frankfurt VIP) */}
        <g className="world-home" transform={`translate(${homeProj[0]} ${homeProj[1]})`}>
          <circle r="6" fill="none" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.6">
            <animate attributeName="r" values="3;9;3" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="2.2" fill="var(--theme-accent)" style={{ filter: 'drop-shadow(0 0 4px var(--theme-accent)) drop-shadow(0 0 10px var(--theme-accent))' }} />
          <circle r="1" fill="var(--theme-text)" />
          <text y="-3.4" textAnchor="middle" className="world-home-label">{SYSTEM_HOME.city}</text>
          <text y="6.4" textAnchor="middle" className="world-home-coord">VIP · {SYSTEM_HOME.country}</text>
        </g>
        {/* Trajectory arcs — every source aims at the home */}
        {projected.map(({ src, point }, idx) => {
          const color = KIND_COLORS[src.kind];
          const [x1, y1] = point;
          const [x2, y2] = homeProj;
          const midX = (x1 + x2) / 2;
          // Curve upward (negative y bow) for visual drama
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const bow = Math.min(40, dist * 0.35);
          const midY = (y1 + y2) / 2 - bow;
          const path = `M${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
          const animActive = activeIds.has(src.id);
          return (
            <g key={src.id} className={`world-traj ${animActive ? 'is-active' : ''} kind-${src.kind}`}>
              <path d={path} stroke={color} strokeWidth="0.28" fill="none" opacity={animActive ? 0.7 : 0.25} />
              {animActive && (
                <>
                  <path d={path} stroke={color} strokeWidth="0.5" fill="none" strokeDasharray="3 6" style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }}>
                    <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.6s" repeatCount="indefinite" />
                  </path>
                  <circle r="1.1" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={path} begin={`${(idx * 0.1) % 0.8}s`} />
                  </circle>
                  <circle r="0.7" fill={color} opacity="0.7">
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={path} begin={`${0.4 + (idx * 0.1) % 0.6}s`} />
                  </circle>
                </>
              )}
              {/* Source dot */}
              <circle cx={x1} cy={y1} r="1.4" fill={color} style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }} />
              <circle cx={x1} cy={y1} r="2.6" fill="none" stroke={color} strokeWidth="0.3" opacity="0.55">
                <animate attributeName="r" values="2.6;5;2.6" dur="2.2s" repeatCount="indefinite" begin={`${idx * 0.13}s`} />
                <animate attributeName="opacity" values="0.55;0;0.55" dur="2.2s" repeatCount="indefinite" begin={`${idx * 0.13}s`} />
              </circle>
              <text x={x1} y={y1 - 2.2} textAnchor="middle" className="world-source-label">{src.country}</text>
            </g>
          );
        })}
      </svg>
      {/* Iron Man unfold panels — one per active source, positioned absolutely on top of the SVG */}
      <div className="world-panels">
        {projected
          .filter(({ src }) => activeIds.has(src.id))
          .map(({ src, point }, idx) => {
            const [px, py] = point;
            // Convert SVG coords (0..360, 0..180) to percentages relative to the SVG canvas.
            const left = `${(px / 360) * 100}%`;
            const top = `${(py / 180) * 100}%`;
            const tone = STATUS_TONE(src.status);
            return (
              <div
                key={src.id}
                className={`world-panel tone-${tone} kind-${src.kind}`}
                style={{ left, top, animationDelay: `${idx * 80}ms` }}
              >
                <div className="world-panel-bracket" />
                <header>
                  <span className="world-panel-flag">{src.country}</span>
                  <strong>{src.city}</strong>
                  <em>{src.kind}</em>
                </header>
                <dl>
                  <div><dt>IP</dt><dd>{src.ip}</dd></div>
                  <div><dt>HOST</dt><dd>{src.host}</dd></div>
                  <div><dt>{src.method}</dt><dd className={`status-${tone}`}>{src.status}</dd></div>
                  <div><dt>RPS</dt><dd>{src.rps}/s</dd></div>
                  <div><dt>BYTES</dt><dd>{src.bytes >= 1024 ? `${(src.bytes / 1024).toFixed(1)} KB` : `${src.bytes} B`}</dd></div>
                </dl>
              </div>
            );
          })}
      </div>
      {/* Bottom legend */}
      <div className="world-traffic-legend">
        <span className="leg-ingress"><i />ingress</span>
        <span className="leg-auth"><i />auth</span>
        <span className="leg-replication"><i />replication</span>
        <span className="leg-sync"><i />sync</span>
        <span className="leg-backup"><i />backup</span>
        <span className="leg-meta">tick #{seed} · {sources.length} sources · {activeIds.size} live</span>
      </div>
    </div>
  );
}

/* -------------------- Threat-intel map (MDR / XDR overlay, big hero panel) -------------------- */

interface ThreatActor {
  id: string;
  /** Geographic origin */
  city: string;
  country: string;
  lat: number;
  lng: number;
  /** APT / threat-group attribution (e.g. APT28, LAZARUS) */
  actor: string;
  /** CVE ID being weaponised (e.g. CVE-2024-3094) */
  cve: string;
  /** Malware family / payload */
  malware: string;
  /** Primary tactic from MITRE ATT&CK */
  tactic: 'recon' | 'initial-access' | 'execution' | 'persistence' | 'lateral' | 'exfil' | 'c2';
  /** XDR severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** What the MDR/XDR platform did about it */
  action: 'blocked' | 'isolated' | 'escalated' | 'observing' | 'auto-rolled-back';
  /** Source IP being blocked / observed */
  ip: string;
  /** Number of indicators-of-compromise observed */
  iocCount: number;
}

const DEFAULT_THREATS: ThreatActor[] = [
  { id: 't1', city: 'Saint Petersburg', country: 'RU', lat: 59.9, lng: 30.3, actor: 'APT28 / Fancy Bear', cve: 'CVE-2024-3094', malware: 'XZ Utils backdoor', tactic: 'initial-access', severity: 'critical', action: 'blocked', ip: '203.0.113.61', iocCount: 184 },
  { id: 't2', city: 'Pyongyang', country: 'KP', lat: 39.0, lng: 125.7, actor: 'LAZARUS', cve: 'CVE-2024-21338', malware: 'FudModule rootkit', tactic: 'persistence', severity: 'critical', action: 'isolated', ip: '198.51.100.7', iocCount: 96 },
  { id: 't3', city: 'Tehran', country: 'IR', lat: 35.7, lng: 51.4, actor: 'APT34 / OilRig', cve: 'CVE-2023-46805', malware: 'Karkoff dropper', tactic: 'recon', severity: 'high', action: 'observing', ip: '203.0.113.84', iocCount: 38 },
  { id: 't4', city: 'Shanghai', country: 'CN', lat: 31.2, lng: 121.5, actor: 'APT41 / BARIUM', cve: 'CVE-2024-1086', malware: 'Mootbot variant', tactic: 'lateral', severity: 'high', action: 'escalated', ip: '198.51.100.42', iocCount: 122 },
  { id: 't5', city: 'Lagos', country: 'NG', lat: 6.5, lng: 3.4, actor: 'TA505', cve: 'CVE-2023-50164', malware: 'Cobalt Strike beacon', tactic: 'c2', severity: 'medium', action: 'blocked', ip: '203.0.113.140', iocCount: 28 },
  { id: 't6', city: 'Brasília', country: 'BR', lat: -15.8, lng: -47.9, actor: 'Coyote', cve: 'CVE-2024-6387', malware: 'Coyote banker', tactic: 'execution', severity: 'medium', action: 'auto-rolled-back', ip: '198.51.100.219', iocCount: 12 },
  { id: 't7', city: 'Hanoi', country: 'VN', lat: 21.0, lng: 105.8, actor: 'APT32 / OceanLotus', cve: 'CVE-2024-30040', malware: 'Cobra DocGuard', tactic: 'initial-access', severity: 'high', action: 'blocked', ip: '203.0.113.22', iocCount: 64 },
  { id: 't8', city: 'Caracas', country: 'VE', lat: 10.5, lng: -66.9, actor: 'unattributed', cve: 'CVE-2024-21893', malware: 'GoMet implant', tactic: 'exfil', severity: 'low', action: 'observing', ip: '198.51.100.198', iocCount: 6 },
];

interface ThreatIntelMapProps {
  snapshot?: EnvironmentSnapshot;
  sources?: TrafficSource[];
  threats?: ThreatActor[];
  height?: number;
}

const SEVERITY_TONE: Record<ThreatActor['severity'], string> = {
  low: 'var(--theme-good)',
  medium: 'var(--theme-accent-2)',
  high: '#ff7a3d',  // amber-red for high
  critical: '#ff2d4a', // hard scarlet red for critical (matches attack trajectories)
};

const ACTION_LABEL: Record<ThreatActor['action'], string> = {
  blocked: 'BLOCKED',
  isolated: 'ISOLATED',
  escalated: 'ESCALATED',
  observing: 'OBSERVING',
  'auto-rolled-back': 'ROLLED BACK',
};

/** Simulated "city lights at night" — random glow dots scattered across each
 * continent. Stable across re-renders so the lights don't strobe randomly. */
const CITY_LIGHTS: { x: number; y: number; r: number; bright: boolean }[] = (() => {
  const lights: { x: number; y: number; r: number; bright: boolean }[] = [];
  // Hand-picked clusters within continent bounding boxes — denser than v1
  const clusters = [
    { cx: 60, cy: 70, n: 80 },   // North America east coast
    { cx: 38, cy: 76, n: 42 },   // North America west coast
    { cx: 50, cy: 60, n: 28 },   // North America Canada
    { cx: 96, cy: 80, n: 16 },   // Caribbean
    { cx: 110, cy: 130, n: 48 }, // South America east coast
    { cx: 100, cy: 150, n: 24 }, // South America southern cone
    { cx: 188, cy: 56, n: 70 },  // Europe core
    { cx: 178, cy: 50, n: 26 },  // UK / Ireland
    { cx: 208, cy: 50, n: 22 },  // Scandinavia
    { cx: 222, cy: 60, n: 28 },  // Eastern Europe / Russia west
    { cx: 195, cy: 78, n: 28 },  // North Africa / Mediterranean
    { cx: 200, cy: 100, n: 38 }, // Sub-Saharan Africa
    { cx: 210, cy: 132, n: 18 }, // Southern Africa
    { cx: 252, cy: 50, n: 56 },  // Russia / Central Asia
    { cx: 244, cy: 76, n: 36 },  // India
    { cx: 290, cy: 70, n: 60 },  // East Asia / China / Korea / Japan
    { cx: 256, cy: 92, n: 42 },  // SE Asia
    { cx: 304, cy: 134, n: 22 }, // Australia
    { cx: 318, cy: 150, n: 8 },  // New Zealand
  ];
  let s = 17;
  for (const cl of clusters) {
    for (let i = 0; i < cl.n; i += 1) {
      s = (s * 9301 + 49297) % 233280;
      const angle = (s / 233280) * Math.PI * 2;
      s = (s * 9301 + 49297) % 233280;
      const radius = (s / 233280) * 18;
      s = (s * 9301 + 49297) % 233280;
      const r = 0.25 + (s / 233280) * 0.55;
      s = (s * 9301 + 49297) % 233280;
      const bright = (s / 233280) < 0.18;
      lights.push({
        x: cl.cx + Math.cos(angle) * radius,
        y: cl.cy + Math.sin(angle) * radius,
        r,
        bright,
      });
    }
  }
  return lights;
})();

/** Catalogue of well-known city locations across the globe. These show up as
 * small DIM hollow dots on the map (passive — not currently communicating).
 * When a TrafficSource or threat hotspot lands on the same coordinates, the
 * widget highlights that location while the rest stay quietly visible. */
const PASSIVE_LOCATIONS: { city: string; country: string; lat: number; lng: number }[] = [
  { city: 'Anchorage', country: 'US', lat: 61.2, lng: -149.9 },
  { city: 'Vancouver', country: 'CA', lat: 49.3, lng: -123.1 },
  { city: 'Seattle', country: 'US', lat: 47.6, lng: -122.3 },
  { city: 'Portland', country: 'US', lat: 45.5, lng: -122.7 },
  { city: 'Salt Lake City', country: 'US', lat: 40.8, lng: -111.9 },
  { city: 'Denver', country: 'US', lat: 39.7, lng: -105.0 },
  { city: 'Phoenix', country: 'US', lat: 33.4, lng: -112.1 },
  { city: 'Los Angeles', country: 'US', lat: 34.1, lng: -118.2 },
  { city: 'San Diego', country: 'US', lat: 32.7, lng: -117.2 },
  { city: 'Houston', country: 'US', lat: 29.8, lng: -95.4 },
  { city: 'Dallas', country: 'US', lat: 32.8, lng: -96.8 },
  { city: 'Atlanta', country: 'US', lat: 33.7, lng: -84.4 },
  { city: 'Miami', country: 'US', lat: 25.8, lng: -80.2 },
  { city: 'Chicago', country: 'US', lat: 41.9, lng: -87.7 },
  { city: 'Detroit', country: 'US', lat: 42.3, lng: -83.0 },
  { city: 'Boston', country: 'US', lat: 42.4, lng: -71.1 },
  { city: 'Washington', country: 'US', lat: 38.9, lng: -77.0 },
  { city: 'Montreal', country: 'CA', lat: 45.5, lng: -73.6 },
  { city: 'Mexico City', country: 'MX', lat: 19.4, lng: -99.1 },
  { city: 'Lima', country: 'PE', lat: -12.0, lng: -77.0 },
  { city: 'Bogotá', country: 'CO', lat: 4.7, lng: -74.1 },
  { city: 'Caracas', country: 'VE', lat: 10.5, lng: -66.9 },
  { city: 'Buenos Aires', country: 'AR', lat: -34.6, lng: -58.4 },
  { city: 'Rio', country: 'BR', lat: -22.9, lng: -43.2 },
  { city: 'Brasília', country: 'BR', lat: -15.8, lng: -47.9 },
  { city: 'Santiago', country: 'CL', lat: -33.5, lng: -70.7 },
  { city: 'Reykjavik', country: 'IS', lat: 64.1, lng: -21.9 },
  { city: 'Dublin', country: 'IE', lat: 53.3, lng: -6.3 },
  { city: 'Edinburgh', country: 'UK', lat: 55.9, lng: -3.2 },
  { city: 'Madrid', country: 'ES', lat: 40.4, lng: -3.7 },
  { city: 'Lisbon', country: 'PT', lat: 38.7, lng: -9.1 },
  { city: 'Barcelona', country: 'ES', lat: 41.4, lng: 2.2 },
  { city: 'Paris', country: 'FR', lat: 48.9, lng: 2.3 },
  { city: 'Amsterdam', country: 'NL', lat: 52.4, lng: 4.9 },
  { city: 'Brussels', country: 'BE', lat: 50.8, lng: 4.4 },
  { city: 'Copenhagen', country: 'DK', lat: 55.7, lng: 12.6 },
  { city: 'Oslo', country: 'NO', lat: 59.9, lng: 10.8 },
  { city: 'Stockholm', country: 'SE', lat: 59.3, lng: 18.1 },
  { city: 'Helsinki', country: 'FI', lat: 60.2, lng: 24.9 },
  { city: 'Berlin', country: 'DE', lat: 52.5, lng: 13.4 },
  { city: 'Munich', country: 'DE', lat: 48.1, lng: 11.6 },
  { city: 'Vienna', country: 'AT', lat: 48.2, lng: 16.4 },
  { city: 'Prague', country: 'CZ', lat: 50.1, lng: 14.4 },
  { city: 'Warsaw', country: 'PL', lat: 52.2, lng: 21.0 },
  { city: 'Rome', country: 'IT', lat: 41.9, lng: 12.5 },
  { city: 'Athens', country: 'GR', lat: 38.0, lng: 23.7 },
  { city: 'Istanbul', country: 'TR', lat: 41.0, lng: 29.0 },
  { city: 'Moscow', country: 'RU', lat: 55.8, lng: 37.6 },
  { city: 'Saint Petersburg', country: 'RU', lat: 59.9, lng: 30.3 },
  { city: 'Kiev', country: 'UA', lat: 50.5, lng: 30.5 },
  { city: 'Tel Aviv', country: 'IL', lat: 32.1, lng: 34.8 },
  { city: 'Cairo', country: 'EG', lat: 30.0, lng: 31.2 },
  { city: 'Riyadh', country: 'SA', lat: 24.7, lng: 46.7 },
  { city: 'Tehran', country: 'IR', lat: 35.7, lng: 51.4 },
  { city: 'Karachi', country: 'PK', lat: 24.9, lng: 67.0 },
  { city: 'Delhi', country: 'IN', lat: 28.6, lng: 77.2 },
  { city: 'Bangalore', country: 'IN', lat: 13.0, lng: 77.6 },
  { city: 'Chennai', country: 'IN', lat: 13.1, lng: 80.3 },
  { city: 'Bangkok', country: 'TH', lat: 13.7, lng: 100.5 },
  { city: 'Kuala Lumpur', country: 'MY', lat: 3.1, lng: 101.7 },
  { city: 'Jakarta', country: 'ID', lat: -6.2, lng: 106.9 },
  { city: 'Manila', country: 'PH', lat: 14.6, lng: 121.0 },
  { city: 'Hanoi', country: 'VN', lat: 21.0, lng: 105.8 },
  { city: 'Hong Kong', country: 'HK', lat: 22.3, lng: 114.2 },
  { city: 'Taipei', country: 'TW', lat: 25.0, lng: 121.5 },
  { city: 'Shanghai', country: 'CN', lat: 31.2, lng: 121.5 },
  { city: 'Beijing', country: 'CN', lat: 39.9, lng: 116.4 },
  { city: 'Pyongyang', country: 'KP', lat: 39.0, lng: 125.7 },
  { city: 'Seoul', country: 'KR', lat: 37.6, lng: 126.9 },
  { city: 'Osaka', country: 'JP', lat: 34.7, lng: 135.5 },
  { city: 'Auckland', country: 'NZ', lat: -36.8, lng: 174.8 },
  { city: 'Perth', country: 'AU', lat: -31.9, lng: 115.9 },
  { city: 'Brisbane', country: 'AU', lat: -27.5, lng: 153.0 },
  { city: 'Melbourne', country: 'AU', lat: -37.8, lng: 145.0 },
  { city: 'Lagos', country: 'NG', lat: 6.5, lng: 3.4 },
  { city: 'Nairobi', country: 'KE', lat: -1.3, lng: 36.8 },
  { city: 'Addis Ababa', country: 'ET', lat: 9.0, lng: 38.7 },
  { city: 'Dakar', country: 'SN', lat: 14.7, lng: -17.4 },
  { city: 'Johannesburg', country: 'ZA', lat: -26.2, lng: 28.0 },
  { city: 'Casablanca', country: 'MA', lat: 33.6, lng: -7.6 },
  { city: 'Algiers', country: 'DZ', lat: 36.7, lng: 3.1 },
];

/** Pre-defined inter-DC network paths (cyan trade-route lines) — densely
 * cross-connected so the map looks like a real global ops backbone, not just
 * a hub-and-spoke. Generated programmatically so the line count scales with
 * the city list. */
const NETWORK_PATHS: { a: [number, number]; b: [number, number]; channel: 'mgmt' | 'storage' | 'mesh' }[] = (() => {
  const cities: Record<string, [number, number]> = {
    frankfurt: projectGeo(50.1, 8.7),
    london: projectGeo(51.5, -0.1),
    paris: projectGeo(48.9, 2.3),
    amsterdam: projectGeo(52.4, 4.9),
    stockholm: projectGeo(59.3, 18.1),
    moscow: projectGeo(55.8, 37.6),
    nyc: projectGeo(40.7, -74.0),
    chicago: projectGeo(41.9, -87.7),
    dallas: projectGeo(32.8, -96.8),
    sj: projectGeo(37.3, -121.9),
    losangeles: projectGeo(34.1, -118.2),
    seattle: projectGeo(47.6, -122.3),
    miami: projectGeo(25.8, -80.2),
    tokyo: projectGeo(35.7, 139.7),
    osaka: projectGeo(34.7, 135.5),
    seoul: projectGeo(37.6, 126.9),
    beijing: projectGeo(39.9, 116.4),
    shanghai: projectGeo(31.2, 121.5),
    hk: projectGeo(22.3, 114.2),
    sg: projectGeo(1.4, 103.8),
    sydney: projectGeo(-33.9, 151.2),
    auckland: projectGeo(-36.8, 174.8),
    dubai: projectGeo(25.3, 55.3),
    riyadh: projectGeo(24.7, 46.7),
    saopaulo: projectGeo(-23.5, -46.6),
    rio: projectGeo(-22.9, -43.2),
    buenosaires: projectGeo(-34.6, -58.4),
    mexicocity: projectGeo(19.4, -99.1),
    capetown: projectGeo(-33.9, 18.4),
    lagos: projectGeo(6.5, 3.4),
    cairo: projectGeo(30.0, 31.2),
    nairobi: projectGeo(-1.3, 36.8),
    mumbai: projectGeo(19.1, 72.9),
    bangalore: projectGeo(13.0, 77.6),
    delhi: projectGeo(28.6, 77.2),
    toronto: projectGeo(43.7, -79.4),
    montreal: projectGeo(45.5, -73.6),
  };
  const channels: ('mgmt' | 'storage' | 'mesh')[] = ['mgmt', 'storage', 'mesh'];
  // Major hub cross-connects (Frankfurt-centric since that's the VIP)
  const hubLinks: [string, string][] = [
    ['frankfurt', 'london'],
    ['frankfurt', 'paris'],
    ['frankfurt', 'amsterdam'],
    ['frankfurt', 'stockholm'],
    ['frankfurt', 'moscow'],
    ['frankfurt', 'nyc'],
    ['frankfurt', 'toronto'],
    ['frankfurt', 'dubai'],
    ['frankfurt', 'mumbai'],
    ['frankfurt', 'capetown'],
    ['frankfurt', 'cairo'],
    ['frankfurt', 'seoul'],
    ['frankfurt', 'tokyo'],
    ['london', 'amsterdam'],
    ['london', 'paris'],
    ['london', 'nyc'],
    ['amsterdam', 'stockholm'],
    ['paris', 'capetown'],
    ['nyc', 'chicago'],
    ['nyc', 'toronto'],
    ['nyc', 'miami'],
    ['nyc', 'sj'],
    ['nyc', 'dallas'],
    ['chicago', 'sj'],
    ['chicago', 'dallas'],
    ['sj', 'seattle'],
    ['sj', 'losangeles'],
    ['losangeles', 'tokyo'],
    ['seattle', 'tokyo'],
    ['tokyo', 'osaka'],
    ['tokyo', 'seoul'],
    ['seoul', 'beijing'],
    ['beijing', 'shanghai'],
    ['shanghai', 'hk'],
    ['hk', 'sg'],
    ['sg', 'mumbai'],
    ['sg', 'bangalore'],
    ['sg', 'sydney'],
    ['sg', 'auckland'],
    ['sg', 'tokyo'],
    ['mumbai', 'bangalore'],
    ['mumbai', 'delhi'],
    ['mumbai', 'dubai'],
    ['dubai', 'riyadh'],
    ['dubai', 'cairo'],
    ['cairo', 'lagos'],
    ['cairo', 'nairobi'],
    ['lagos', 'capetown'],
    ['nairobi', 'capetown'],
    ['miami', 'mexicocity'],
    ['miami', 'saopaulo'],
    ['miami', 'rio'],
    ['saopaulo', 'rio'],
    ['saopaulo', 'buenosaires'],
    ['saopaulo', 'capetown'],
    ['toronto', 'montreal'],
    ['toronto', 'chicago'],
    ['montreal', 'london'],
    ['sydney', 'auckland'],
    ['sydney', 'tokyo'],
  ];
  return hubLinks.map(([from, to], idx) => ({
    a: cities[from],
    b: cities[to],
    channel: channels[idx % channels.length],
  }));
})();

export function ThreatIntelMap({
  snapshot,
  sources = DEFAULT_SOURCES,
  threats = DEFAULT_THREATS,
  height = 540,
}: ThreatIntelMapProps) {
  const seed = snapshot?.tick ?? 0;
  const homeProj = projectGeo(SYSTEM_HOME.lat, SYSTEM_HOME.lng);

  // Cycle which sources have an Iron-Man unfold panel
  const activeIds = useMemo(() => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      ids.push(sources[(seed + i * 3) % sources.length].id);
    }
    return new Set(ids);
  }, [seed, sources]);

  const projectedSources = useMemo(
    () => sources.map((src) => ({ src, point: projectGeo(src.lat, src.lng) })),
    [sources],
  );
  const projectedThreats = useMemo(
    () => threats.map((t) => ({ t, point: projectGeo(t.lat, t.lng) })),
    [threats],
  );

  // Aggregate XDR stats — light perturbation per tick so the side panels feel live
  const xdrStats = useMemo(() => {
    const drift = (i: number) => ((seed * 7 + i * 13) % 17) - 8;
    return {
      alertsPerMin: 4280 + drift(1) * 12,
      blocked24h: 18420 + drift(2) * 96,
      escalated24h: 142 + (Math.abs(drift(3)) % 6),
      isolatedHosts: 3 + (Math.abs(drift(4)) % 3),
      iocsToday: 9824 + drift(5) * 40,
      mttd: '4.2 s',
      mttr: '38 s',
      activeAPTs: 6,
      criticalCves: 3,
    };
  }, [seed]);

  // Rotating subset of threats shown in the left ACTIVE THREATS panel
  const visibleThreats = useMemo(() => {
    return threats.slice(0, 5).map((t, idx) => ({
      ...t,
      _liveDelay: ((seed * 3 + idx * 7) % 9) + 1,
    }));
  }, [threats, seed]);

  // DEFCON-style overall posture
  const defcon = useMemo(() => {
    const critCount = threats.filter((t) => t.severity === 'critical').length;
    if (critCount >= 3) return { level: 1, label: 'DEFCON 1', tone: 'danger' };
    if (critCount >= 2) return { level: 2, label: 'DEFCON 2', tone: 'warn' };
    if (critCount >= 1) return { level: 3, label: 'DEFCON 3', tone: 'warn' };
    return { level: 4, label: 'DEFCON 4', tone: 'good' };
  }, [threats]);

  return (
    <div className="threat-intel-map" style={{ height }}>
      {/* Center — the big map */}
      <div className="tim-canvas">
        <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <radialGradient id="tim-bg-glow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.45" />
              <stop offset="60%" stopColor="var(--theme-accent-soft)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
            </radialGradient>
            <pattern id="tim-graticule" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--theme-grid)" strokeWidth="0.18" />
            </pattern>
            <radialGradient id="tim-threat-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff2d4a" stopOpacity="0.7" />
              <stop offset="80%" stopColor="#ff2d4a" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="tim-light-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--theme-warn)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--theme-warn)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Background glow + graticule */}
          <rect x="0" y="0" width="360" height="180" fill="url(#tim-bg-glow)" />
          <rect x="0" y="0" width="360" height="180" fill="url(#tim-graticule)" opacity="0.55" />
          {/* Equator + tropics */}
          <line x1="0" y1="90" x2="360" y2="90" stroke="var(--theme-accent)" strokeWidth="0.25" strokeDasharray="2 3" opacity="0.4" />
          <line x1="0" y1="66" x2="360" y2="66" stroke="var(--theme-accent-soft)" strokeWidth="0.18" strokeDasharray="1 4" opacity="0.5" />
          <line x1="0" y1="114" x2="360" y2="114" stroke="var(--theme-accent-soft)" strokeWidth="0.18" strokeDasharray="1 4" opacity="0.5" />
          {/* Continents — faded ghostly silhouettes (underlay) */}
          {CONTINENT_PATHS.map((c) => (
            <g key={c.id}>
              <path d={c.d} fill="var(--theme-accent-soft)" fillOpacity="0.16" stroke="var(--theme-accent)" strokeWidth="0.2" opacity="0.45" />
            </g>
          ))}
          {/* Countries — every country drawn as a faded outline. Active
              countries (from sources or threats) get highlighted on top. */}
          {COUNTRIES.map((country) => {
            const isThreat = threats.some((t) => t.country === country.code);
            const isSource = sources.some((s) => s.country === country.code);
            const isActive = isThreat || isSource;
            const fill = isThreat ? '#ff2d4a' : isSource ? 'var(--theme-accent)' : 'var(--theme-accent-soft)';
            return (
              <g key={country.code} className={`tim-country ${isActive ? 'is-active' : 'is-passive'} ${isThreat ? 'is-threat' : ''}`}>
                {/* Faded base layer — every country always visible */}
                <path
                  d={country.d}
                  fill={fill}
                  fillOpacity={isThreat ? 0.32 : isSource ? 0.28 : 0.12}
                  stroke={isThreat ? '#ff2d4a' : isSource ? 'var(--theme-accent)' : 'var(--theme-text-dim)'}
                  strokeWidth={isActive ? '0.4' : '0.18'}
                  opacity={isActive ? 1 : 0.55}
                  style={isActive ? { filter: `drop-shadow(0 0 2px ${isThreat ? '#ff2d4a' : 'var(--theme-accent)'}) drop-shadow(0 0 5px ${isThreat ? '#ff2d4a' : 'var(--theme-accent)'})` } : undefined}
                />
                {isActive && (
                  /* Bright highlight stroke pass on top */
                  <path
                    d={country.d}
                    fill="none"
                    stroke={isThreat ? '#ff2d4a' : 'var(--theme-accent)'}
                    strokeWidth="0.55"
                    opacity="0.95"
                    style={{ filter: `drop-shadow(0 0 3px ${isThreat ? '#ff2d4a' : 'var(--theme-accent)'})` }}
                  >
                    <animate attributeName="stroke-width" values="0.45;0.85;0.45" dur="2s" repeatCount="indefinite" />
                  </path>
                )}
              </g>
            );
          })}
          {/* City lights at night */}
          {CITY_LIGHTS.map((light, idx) => (
            <circle
              key={idx}
              cx={light.x}
              cy={light.y}
              r={light.r}
              fill={light.bright ? 'var(--theme-warn)' : 'var(--theme-accent-2)'}
              opacity={light.bright ? 0.85 : 0.55}
              style={{ filter: light.bright ? 'drop-shadow(0 0 1.5px var(--theme-warn))' : undefined }}
            >
              <animate
                attributeName="opacity"
                values={light.bright ? '0.55;1;0.55' : '0.3;0.7;0.3'}
                dur={`${2.5 + (idx % 5) * 0.4}s`}
                repeatCount="indefinite"
                begin={`${(idx % 7) * 0.18}s`}
              />
            </circle>
          ))}
          {/* Inter-DC network paths */}
          {NETWORK_PATHS.map((path, idx) => {
            const color = `var(--theme-channel-${path.channel})`;
            const [ax, ay] = path.a;
            const [bx, by] = path.b;
            const midX = (ax + bx) / 2;
            const dist = Math.hypot(bx - ax, by - ay);
            const bow = Math.min(50, dist * 0.42);
            const midY = (ay + by) / 2 - bow;
            const d = `M${ax} ${ay} Q ${midX} ${midY} ${bx} ${by}`;
            return (
              <g key={idx} className={`tim-net-path channel-${path.channel}`}>
                <path d={d} stroke={color} strokeWidth="0.35" fill="none" opacity="0.45" />
                <path d={d} stroke={color} strokeWidth="0.55" fill="none" strokeDasharray="3 5" opacity="0.85" style={{ filter: `drop-shadow(0 0 2px ${color})` }}>
                  <animate attributeName="stroke-dashoffset" values="0;-16" dur={`${4 + (idx % 4)}s`} repeatCount="indefinite" />
                </path>
                <circle r="0.7" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
                  <animateMotion dur={`${5 + (idx % 4)}s`} repeatCount="indefinite" path={d} begin={`${idx * 0.3}s`} />
                </circle>
              </g>
            );
          })}
          {/* Frankfurt VIP halo */}
          <g transform={`translate(${homeProj[0]} ${homeProj[1]})`}>
            <circle r="6" fill="none" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.6">
              <animate attributeName="r" values="3;9;3" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r="2.4" fill="var(--theme-accent)" style={{ filter: 'drop-shadow(0 0 5px var(--theme-accent)) drop-shadow(0 0 12px var(--theme-accent))' }} />
            <circle r="1" fill="var(--theme-text)" />
            <text y="-3.4" textAnchor="middle" className="tim-home-label">{SYSTEM_HOME.city}</text>
            <text y="6.4" textAnchor="middle" className="tim-home-coord">VIP · {SYSTEM_HOME.country}</text>
          </g>
          {/* Passive locations — every major city shown as a dim hollow dot.
              These stay quiet unless they coincide with an active source / threat. */}
          {PASSIVE_LOCATIONS.map((loc, idx) => {
            const [px, py] = projectGeo(loc.lat, loc.lng);
            return (
              <g key={`loc-${idx}`} className="tim-passive">
                <circle cx={px} cy={py} r="0.55" fill="none" stroke="var(--theme-text-dim)" strokeWidth="0.18" opacity="0.55" />
                <circle cx={px} cy={py} r="0.18" fill="var(--theme-text-dim)" opacity="0.45" />
              </g>
            );
          })}

          {/* RED ATTACK TRAJECTORIES — each threat draws an angry red arc
              from its country to the Frankfurt VIP. Always visible (every
              tick), separate from kind-coloured legitimate-traffic arcs.
              Hard-coded scarlet red so it stays "red" across every theme
              regardless of the theme's `--theme-danger` token shade. */}
          {projectedThreats.map(({ t, point }, idx) => {
            const [x1, y1] = point;
            const [x2, y2] = homeProj;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const bow = Math.min(46, dist * 0.4);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - bow;
            const path = `M${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
            const ATTACK_RED = '#ff2d4a';
            return (
              <g key={`atk-${t.id}`} className={`tim-attack sev-${t.severity}`}>
                <path d={path} stroke={ATTACK_RED} strokeWidth="0.32" fill="none" opacity="0.55" />
                <path
                  d={path}
                  stroke={ATTACK_RED}
                  strokeWidth="0.6"
                  fill="none"
                  strokeDasharray="3 5"
                  opacity="0.92"
                  style={{ filter: `drop-shadow(0 0 2px ${ATTACK_RED}) drop-shadow(0 0 6px ${ATTACK_RED})` }}
                >
                  <animate attributeName="stroke-dashoffset" values="0;-16" dur={`${1.2 + (idx % 3) * 0.3}s`} repeatCount="indefinite" />
                </path>
                {/* Two travelling red threat blobs */}
                <circle r="1.2" fill={ATTACK_RED} style={{ filter: `drop-shadow(0 0 4px ${ATTACK_RED}) drop-shadow(0 0 9px ${ATTACK_RED})` }}>
                  <animateMotion dur={`${1.5 + (idx % 4) * 0.28}s`} repeatCount="indefinite" path={path} begin={`${(idx * 0.08) % 0.6}s`} />
                </circle>
                <circle r="0.75" fill={ATTACK_RED} opacity="0.75">
                  <animateMotion dur={`${1.5 + (idx % 4) * 0.28}s`} repeatCount="indefinite" path={path} begin={`${0.4 + (idx * 0.08) % 0.6}s`} />
                </circle>
              </g>
            );
          })}

          {/* Threat hotspots — RED flares marking the attack origins */}
          {projectedThreats.map(({ t, point }, idx) => {
            const [tx, ty] = point;
            const ATTACK_RED = '#ff2d4a';
            return (
              <g key={t.id} className={`tim-threat-flare sev-${t.severity}`}>
                <circle cx={tx} cy={ty} r="6" fill="url(#tim-threat-glow)" opacity="0.65">
                  <animate attributeName="r" values="3;7;3" dur={`${1.4 + (idx % 4) * 0.25}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.75;0;0.75" dur={`${1.4 + (idx % 4) * 0.25}s`} repeatCount="indefinite" />
                </circle>
                <circle cx={tx} cy={ty} r="1.7" fill={ATTACK_RED} style={{ filter: `drop-shadow(0 0 3px ${ATTACK_RED}) drop-shadow(0 0 9px ${ATTACK_RED})` }} />
                <line x1={tx} y1={ty - 4} x2={tx} y2={ty - 8} stroke={ATTACK_RED} strokeWidth="0.4" opacity="0.92" />
                <line x1={tx + 4} y1={ty} x2={tx + 8} y2={ty} stroke={ATTACK_RED} strokeWidth="0.4" opacity="0.92" />
                <line x1={tx - 4} y1={ty} x2={tx - 8} y2={ty} stroke={ATTACK_RED} strokeWidth="0.4" opacity="0.92" />
                <text x={tx} y={ty - 9.5} textAnchor="middle" className="tim-threat-label" style={{ fill: ATTACK_RED }}>{t.actor.split(' ')[0]}</text>
                <text x={tx} y={ty + 11} textAnchor="middle" className="tim-threat-cve" style={{ fill: ATTACK_RED }}>{t.cve}</text>
              </g>
            );
          })}
          {/* Source dots + trajectory arcs to Frankfurt */}
          {projectedSources.map(({ src, point }, idx) => {
            const color = KIND_COLORS[src.kind];
            const [x1, y1] = point;
            const [x2, y2] = homeProj;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const bow = Math.min(40, dist * 0.32);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - bow;
            const path = `M${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
            const animActive = activeIds.has(src.id);
            return (
              <g key={src.id} className={`tim-traj kind-${src.kind} ${animActive ? 'is-active' : ''}`}>
                <path d={path} stroke={color} strokeWidth="0.25" fill="none" opacity={animActive ? 0.65 : 0.22} />
                {animActive && (
                  <>
                    <path d={path} stroke={color} strokeWidth="0.45" fill="none" strokeDasharray="3 6" style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }}>
                      <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.6s" repeatCount="indefinite" />
                    </path>
                    <circle r="1.1" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
                      <animateMotion dur="2.2s" repeatCount="indefinite" path={path} begin={`${(idx * 0.12) % 0.8}s`} />
                    </circle>
                  </>
                )}
                <circle cx={x1} cy={y1} r="1.4" fill={color} style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }} />
                <circle cx={x1} cy={y1} r="2.6" fill="none" stroke={color} strokeWidth="0.3" opacity="0.55">
                  <animate attributeName="r" values="2.6;5;2.6" dur="2.2s" repeatCount="indefinite" begin={`${idx * 0.13}s`} />
                  <animate attributeName="opacity" values="0.55;0;0.55" dur="2.2s" repeatCount="indefinite" begin={`${idx * 0.13}s`} />
                </circle>
                <text x={x1} y={y1 - 2.2} textAnchor="middle" className="tim-source-label">{src.country}</text>
              </g>
            );
          })}
          {/* Sweep cursor */}
          <line x1="0" y1="2" x2="360" y2="2" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.6" />
          <line x1="0" y1="178" x2="360" y2="178" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.6" />
        </svg>

        {/* Iron Man unfold panels */}
        <div className="tim-panels">
          {projectedSources
            .filter(({ src }) => activeIds.has(src.id))
            .map(({ src, point }, idx) => {
              const [px, py] = point;
              const left = `${(px / 360) * 100}%`;
              const top = `${(py / 180) * 100}%`;
              const tone = STATUS_TONE(src.status);
              return (
                <div key={src.id} className={`tim-panel tone-${tone} kind-${src.kind}`} style={{ left, top, animationDelay: `${idx * 80}ms` }}>
                  <div className="tim-panel-bracket" />
                  <header>
                    <span className="tim-panel-flag">{src.country}</span>
                    <strong>{src.city}</strong>
                    <em>{src.kind}</em>
                  </header>
                  <dl>
                    <div><dt>IP</dt><dd>{src.ip}</dd></div>
                    <div><dt>HOST</dt><dd>{src.host}</dd></div>
                    <div><dt>{src.method}</dt><dd className={`status-${tone}`}>{src.status}</dd></div>
                    <div><dt>RPS</dt><dd>{src.rps}/s</dd></div>
                    <div><dt>BYTES</dt><dd>{src.bytes >= 1024 ? `${(src.bytes / 1024).toFixed(1)} KB` : `${src.bytes} B`}</dd></div>
                  </dl>
                </div>
              );
            })}
        </div>

        {/* Bottom kill-chain strip */}
        <div className="tim-killchain">
          {(['recon', 'initial-access', 'execution', 'persistence', 'lateral', 'c2', 'exfil'] as const).map((stage, idx) => {
            const count = threats.filter((t) => t.tactic === stage).length;
            return (
              <div key={stage} className={`tim-killchain-cell ${count > 0 ? 'is-hit' : ''}`} style={{ animationDelay: `${idx * 70}ms` }}>
                <span>{idx + 1}</span>
                <strong>{stage.replace('-', ' ')}</strong>
                <b>{count}</b>
              </div>
            );
          })}
        </div>

        {/* Top-left overlay: ACTIVE THREATS list (floats over the map) */}
        <aside className="tim-overlay tim-overlay-tl" aria-label="Active threats">
          <header>
            <span className="tim-kicker">XDR · ACTIVE THREATS</span>
            <strong>{threats.length}</strong>
          </header>
          <ul className="tim-threats">
            {visibleThreats.map((t) => (
              <li key={t.id} className={`tim-threat sev-${t.severity}`}>
                <header>
                  <span className="tim-flag">{t.country}</span>
                  <strong>{t.actor}</strong>
                  <em className="tim-action">{ACTION_LABEL[t.action]}</em>
                </header>
                <dl>
                  <div><dt>CVE</dt><dd>{t.cve}</dd></div>
                  <div><dt>MAL</dt><dd>{t.malware}</dd></div>
                  <div><dt>TTP</dt><dd>{t.tactic}</dd></div>
                  <div><dt>IP</dt><dd>{t.ip}</dd></div>
                  <div><dt>IOC</dt><dd>{t.iocCount}</dd></div>
                </dl>
                <i className="tim-threat-pulse" style={{ background: SEVERITY_TONE[t.severity] }} />
              </li>
            ))}
          </ul>
        </aside>

        {/* Top-right overlay: DEFCON + headline stats */}
        <aside className="tim-overlay tim-overlay-tr" aria-label="MDR / XDR posture">
          <div className={`tim-defcon defcon-${defcon.tone}`}>
            <span>{defcon.label}</span>
            <strong>{xdrStats.alertsPerMin.toLocaleString()}<em>/min</em></strong>
            <small>alerts · rolling 1h</small>
          </div>
          <div className="tim-stats tim-stats-compact">
            <div className="tim-stat status-good">
              <span>BLOCKED 24h</span>
              <strong>{xdrStats.blocked24h.toLocaleString()}</strong>
            </div>
            <div className="tim-stat status-warn">
              <span>ESCALATED</span>
              <strong>{xdrStats.escalated24h}</strong>
            </div>
            <div className="tim-stat status-danger">
              <span>ISOLATED</span>
              <strong>{xdrStats.isolatedHosts}</strong>
            </div>
            <div className="tim-stat">
              <span>IOC TODAY</span>
              <strong>{(xdrStats.iocsToday / 1000).toFixed(1)}K</strong>
            </div>
            <div className="tim-stat">
              <span>MTTD</span>
              <strong>{xdrStats.mttd}</strong>
            </div>
            <div className="tim-stat">
              <span>MTTR</span>
              <strong>{xdrStats.mttr}</strong>
            </div>
            <div className="tim-stat status-warn">
              <span>APTs</span>
              <strong>{xdrStats.activeAPTs}</strong>
            </div>
            <div className="tim-stat status-danger">
              <span>CRIT CVE</span>
              <strong>{xdrStats.criticalCves}</strong>
            </div>
          </div>
          <div className="tim-scan">
            <span className="tim-scan-label">LIVE SCAN · {NETWORK_PATHS.length} paths</span>
            <div className="tim-scan-bar"><i /></div>
          </div>
        </aside>

        {/* Bottom-right overlay: rolling activity ribbon */}
        <aside className="tim-overlay tim-overlay-br" aria-label="Live activity ribbon">
          <span className="tim-kicker">REAL-TIME · {sources.length} SRC · {activeIds.size} LIVE</span>
          <ul className="tim-activity-ribbon">
            {sources.slice(0, 6).map((src) => (
              <li key={src.id} className={`kind-${src.kind}`}>
                <span className="tim-flag">{src.country}</span>
                <strong>{src.method}</strong>
                <code>{src.host}</code>
                <b>{src.rps}/s</b>
              </li>
            ))}
          </ul>
        </aside>

        {/* Bottom-left overlay: country source legend */}
        <aside className="tim-overlay tim-overlay-bl" aria-label="Source legend">
          <span className="tim-kicker">SOURCES · {sources.length} GEOS</span>
          <ul className="tim-source-legend">
            {sources.slice(0, 6).map((src) => {
              const color = KIND_COLORS[src.kind];
              return (
                <li key={src.id}>
                  <i style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                  <span>{src.country}</span>
                  <strong>{src.city}</strong>
                  <em>{src.kind}</em>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

/* -------------------- Cluster radar (sonar-style concentric tiers) -------------------- */

interface RadarNode {
  id: string;
  label: string;
  /** Tier dictates which concentric ring the node sits on. */
  tier: 'control' | 'edge' | 'compute' | 'storage' | 'vcluster';
  /** Health 0..100. */
  health: number;
  /** Live RPS / IOPS / equivalent throughput per node */
  throughput: number;
  /** Live p95 latency in milliseconds */
  p95Ms: number;
  /** Recent error rate percent */
  errorPct: number;
  /** Status colour key */
  status: 'online' | 'syncing' | 'watch' | 'draining';
}

const DEFAULT_RADAR_NODES: RadarNode[] = [
  { id: 'cp-1', label: 'control-plane-01', tier: 'control', health: 99, throughput: 412, p95Ms: 8, errorPct: 0.04, status: 'online' },
  { id: 'cp-2', label: 'control-plane-02', tier: 'control', health: 98, throughput: 388, p95Ms: 9, errorPct: 0.02, status: 'online' },
  { id: 'edge-a', label: 'edge-a', tier: 'edge', health: 92, throughput: 1820, p95Ms: 24, errorPct: 0.18, status: 'syncing' },
  { id: 'edge-b', label: 'edge-b', tier: 'edge', health: 95, throughput: 1620, p95Ms: 22, errorPct: 0.12, status: 'online' },
  { id: 'edge-c', label: 'edge-c', tier: 'edge', health: 88, throughput: 1240, p95Ms: 32, errorPct: 0.42, status: 'watch' },
  { id: 'cpu-01', label: 'compute-01', tier: 'compute', health: 88, throughput: 920, p95Ms: 14, errorPct: 0.06, status: 'online' },
  { id: 'cpu-02', label: 'compute-02', tier: 'compute', health: 84, throughput: 880, p95Ms: 18, errorPct: 0.22, status: 'watch' },
  { id: 'cpu-03', label: 'compute-03', tier: 'compute', health: 90, throughput: 1080, p95Ms: 12, errorPct: 0.04, status: 'online' },
  { id: 'cpu-04', label: 'compute-04', tier: 'compute', health: 86, throughput: 980, p95Ms: 16, errorPct: 0.08, status: 'online' },
  { id: 'cpu-05', label: 'compute-05', tier: 'compute', health: 82, throughput: 720, p95Ms: 22, errorPct: 0.16, status: 'online' },
  { id: 'stor-1', label: 'ceph-rack-01', tier: 'storage', health: 96, throughput: 6420, p95Ms: 6, errorPct: 0.02, status: 'online' },
  { id: 'stor-2', label: 'ceph-rack-02', tier: 'storage', health: 94, throughput: 6210, p95Ms: 7, errorPct: 0.04, status: 'online' },
  { id: 'stor-3', label: 'longhorn-rack', tier: 'storage', health: 91, throughput: 1820, p95Ms: 9, errorPct: 0.06, status: 'online' },
  { id: 'stor-4', label: 'nvme-of', tier: 'storage', health: 97, throughput: 12420, p95Ms: 4, errorPct: 0.01, status: 'online' },
  { id: 'vcl-1', label: 'vcluster-edge', tier: 'vcluster', health: 91, throughput: 220, p95Ms: 18, errorPct: 0.12, status: 'online' },
];

const TIER_RADIUS: Record<RadarNode['tier'], number> = {
  control: 14,
  edge: 24,
  compute: 34,
  storage: 42,
  vcluster: 18,
};

const TIER_COLOR: Record<RadarNode['tier'], string> = {
  control: 'var(--theme-accent-2)',
  edge: 'var(--theme-good)',
  compute: 'var(--theme-accent)',
  storage: 'var(--theme-warn)',
  vcluster: 'var(--theme-channel-gitops, var(--theme-accent-2))',
};

const TIER_LABEL: Record<RadarNode['tier'], string> = {
  control: 'CONTROL PLANE',
  edge: 'EDGE',
  compute: 'COMPUTE',
  storage: 'STORAGE',
  vcluster: 'VCLUSTER',
};

interface ClusterRadarProps {
  nodes?: RadarNode[];
  snapshot?: EnvironmentSnapshot;
  height?: number;
}

/** Sonar-style cluster radar — concentric tier rings (control → edge → compute → storage),
 * with nodes positioned around their tier's ring, a rotating sweep cursor that pulses
 * each node as it passes, animated traffic chords between connected nodes, and side
 * panels showing live RPS / latency / error / health per node. Replaces the flat 2D
 * curved-edge topology view. */
export function ClusterRadar({ nodes = DEFAULT_RADAR_NODES, snapshot, height = 460 }: ClusterRadarProps) {
  const seed = snapshot?.tick ?? 0;

  // Group nodes by tier and assign each one a stable angle around its ring
  const positionedNodes = useMemo(() => {
    const groups: Record<string, RadarNode[]> = {};
    for (const node of nodes) {
      (groups[node.tier] = groups[node.tier] ?? []).push(node);
    }
    const positions: { node: RadarNode; angle: number; x: number; y: number; r: number }[] = [];
    for (const [tier, list] of Object.entries(groups)) {
      const r = TIER_RADIUS[tier as RadarNode['tier']];
      list.forEach((node, idx) => {
        // Spread evenly around the ring, with a small per-tier offset so different
        // tier rings don't all line up on the same spokes.
        const offset = tier === 'control' ? 0 : tier === 'edge' ? 0.3 : tier === 'compute' ? 0.15 : tier === 'storage' ? 0.45 : 0.6;
        const angle = ((idx / list.length) * Math.PI * 2) - Math.PI / 2 + offset;
        positions.push({
          node,
          angle,
          x: 50 + Math.cos(angle) * r,
          y: 50 + Math.sin(angle) * r,
          r,
        });
      });
    }
    return positions;
  }, [nodes]);

  // Programmatically generate connection chords (control ↔ edge, edge ↔ compute, compute ↔ storage)
  const chords = useMemo(() => {
    const list: { from: typeof positionedNodes[number]; to: typeof positionedNodes[number]; channel: string }[] = [];
    const byTier = (tier: string) => positionedNodes.filter((p) => p.node.tier === tier);
    const ctrl = byTier('control');
    const edges = byTier('edge');
    const compute = byTier('compute');
    const storage = byTier('storage');
    const vc = byTier('vcluster');
    // control -> all edges
    for (const c of ctrl) for (const e of edges) list.push({ from: c, to: e, channel: 'mgmt' });
    // edges -> all compute (round-robin)
    edges.forEach((e, ei) => {
      compute.forEach((cp, ci) => {
        if ((ci + ei) % 2 === 0) list.push({ from: e, to: cp, channel: 'mesh' });
      });
    });
    // compute -> storage (each compute to two storage)
    compute.forEach((cp, ci) => {
      list.push({ from: cp, to: storage[ci % storage.length], channel: 'storage' });
      list.push({ from: cp, to: storage[(ci + 1) % storage.length], channel: 'storage' });
    });
    // vcluster -> control + storage
    for (const v of vc) {
      if (ctrl[0]) list.push({ from: v, to: ctrl[0], channel: 'gitops' });
      if (storage[0]) list.push({ from: v, to: storage[0], channel: 'storage' });
    }
    return list;
  }, [positionedNodes]);

  // Rolling sweep angle (radians)
  const sweepAngle = ((seed * 0.12) % (Math.PI * 2));
  const sweepDeg = (sweepAngle * 180) / Math.PI;

  // Determine which nodes are "swept" right now (within ~12° of sweep)
  const sweptIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pos of positionedNodes) {
      let a = pos.angle;
      // normalise to 0..2π
      a = (a + Math.PI / 2) % (Math.PI * 2);
      const sweepNorm = (sweepAngle + Math.PI / 2) % (Math.PI * 2);
      const diff = Math.abs(a - sweepNorm);
      const wrap = Math.min(diff, Math.PI * 2 - diff);
      if (wrap < 0.21) ids.add(pos.node.id);
    }
    return ids;
  }, [positionedNodes, sweepAngle]);

  // Aggregate stats for the side rails
  const tierStats = useMemo(() => {
    const tiers: RadarNode['tier'][] = ['control', 'edge', 'compute', 'storage', 'vcluster'];
    return tiers.map((tier) => {
      const list = nodes.filter((n) => n.tier === tier);
      if (list.length === 0) return { tier, count: 0, avgHealth: 0, totalThroughput: 0, avgP95: 0, errors: 0 };
      const totalThroughput = list.reduce((s, n) => s + n.throughput, 0);
      const avgHealth = list.reduce((s, n) => s + n.health, 0) / list.length;
      const avgP95 = list.reduce((s, n) => s + n.p95Ms, 0) / list.length;
      const errors = list.reduce((s, n) => s + n.errorPct, 0) / list.length;
      return { tier, count: list.length, avgHealth, totalThroughput, avgP95, errors };
    });
  }, [nodes]);

  // Top talkers and flagged nodes for the right-side rail
  const topTalkers = useMemo(() => {
    return [...nodes].sort((a, b) => b.throughput - a.throughput).slice(0, 5);
  }, [nodes]);
  const flagged = useMemo(() => {
    return nodes.filter((n) => n.status === 'watch' || n.errorPct > 0.3).slice(0, 4);
  }, [nodes]);

  return (
    <div className="cluster-radar" style={{ height }}>
      {/* Left rail — per-tier infographic */}
      <aside className="radar-rail radar-rail-left" aria-label="Tier roll-up">
        <header>
          <span className="tim-kicker">CLUSTER · TIER ROLL-UP</span>
          <strong>{nodes.length}</strong>
        </header>
        <ul>
          {tierStats.map((stat) => {
            const color = TIER_COLOR[stat.tier];
            return (
              <li key={stat.tier} className={`radar-tier tier-${stat.tier}`}>
                <i style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <div>
                  <strong>{TIER_LABEL[stat.tier]}</strong>
                  <small>{stat.count} nodes · {stat.totalThroughput.toLocaleString()} t/s · {stat.avgP95.toFixed(0)} ms p95</small>
                </div>
                <b style={{ color }}>{stat.avgHealth.toFixed(0)}%</b>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Center — the radar scope */}
      <div className="radar-canvas">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <radialGradient id="radar-bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.5" />
              <stop offset="60%" stopColor="var(--theme-accent-soft)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="radar-sweep-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Background glow */}
          <circle cx="50" cy="50" r="48" fill="url(#radar-bg-glow)" />
          {/* Concentric tier rings */}
          {[14, 24, 34, 42, 47].map((r, idx) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="var(--theme-grid)" strokeWidth={idx === 4 ? 0.4 : 0.25} strokeDasharray={idx === 4 ? 'none' : '0.6 1.2'} opacity={idx === 4 ? 0.7 : 0.55} />
          ))}
          {/* Cardinal cross-hairs */}
          <line x1="3" y1="50" x2="97" y2="50" stroke="var(--theme-accent-soft)" strokeWidth="0.2" />
          <line x1="50" y1="3" x2="50" y2="97" stroke="var(--theme-accent-soft)" strokeWidth="0.2" />
          {/* Diagonal hairs */}
          <line x1="14" y1="14" x2="86" y2="86" stroke="var(--theme-accent-soft)" strokeWidth="0.15" strokeDasharray="0.4 0.8" />
          <line x1="86" y1="14" x2="14" y2="86" stroke="var(--theme-accent-soft)" strokeWidth="0.15" strokeDasharray="0.4 0.8" />
          {/* Tier labels around */}
          {[
            { tier: 'control', angle: -Math.PI / 2, r: 14 },
            { tier: 'edge', angle: -Math.PI / 2, r: 24 },
            { tier: 'compute', angle: -Math.PI / 2, r: 34 },
            { tier: 'storage', angle: -Math.PI / 2, r: 42 },
          ].map(({ tier, angle, r }) => (
            <text
              key={tier}
              x={50 + Math.cos(angle) * (r - 1.5)}
              y={50 + Math.sin(angle) * (r - 1.5) + 0.5}
              textAnchor="middle"
              className="radar-tier-label"
              style={{ fill: TIER_COLOR[tier as RadarNode['tier']] }}
            >
              {TIER_LABEL[tier as RadarNode['tier']]}
            </text>
          ))}
          {/* Connection chords */}
          {chords.map((chord, idx) => {
            const channelColor = `var(--theme-channel-${chord.channel})`;
            return (
              <g key={idx} className={`radar-chord channel-${chord.channel}`}>
                <line x1={chord.from.x} y1={chord.from.y} x2={chord.to.x} y2={chord.to.y} stroke={channelColor} strokeWidth="0.2" opacity="0.32" />
                <line
                  x1={chord.from.x}
                  y1={chord.from.y}
                  x2={chord.to.x}
                  y2={chord.to.y}
                  stroke={channelColor}
                  strokeWidth="0.4"
                  strokeDasharray="1 2"
                  opacity="0.7"
                  style={{ filter: `drop-shadow(0 0 1.5px ${channelColor})` }}
                >
                  <animate attributeName="stroke-dashoffset" values="0;-9" dur={`${2 + (idx % 3) * 0.6}s`} repeatCount="indefinite" />
                </line>
                <circle r="0.45" fill={channelColor} style={{ filter: `drop-shadow(0 0 2px ${channelColor})` }}>
                  <animateMotion
                    dur={`${2.2 + (idx % 5) * 0.4}s`}
                    repeatCount="indefinite"
                    path={`M${chord.from.x} ${chord.from.y} L ${chord.to.x} ${chord.to.y}`}
                    begin={`${(idx * 0.13) % 1.6}s`}
                  />
                </circle>
              </g>
            );
          })}
          {/* Sweep cone */}
          <g className="radar-sweep" transform={`rotate(${sweepDeg} 50 50)`}>
            <path d={`M 50 50 L ${50 + Math.cos(0) * 48} ${50 + Math.sin(0) * 48} A 48 48 0 0 0 ${50 + Math.cos(-0.42) * 48} ${50 + Math.sin(-0.42) * 48} Z`} fill="url(#radar-sweep-grad)" opacity="0.55" />
            <line x1="50" y1="50" x2={50 + 48} y2="50" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.85" style={{ filter: 'drop-shadow(0 0 4px var(--theme-accent))' }} />
          </g>
          {/* Center hub */}
          <circle cx="50" cy="50" r="3.4" fill="var(--theme-accent)" style={{ filter: 'drop-shadow(0 0 4px var(--theme-accent)) drop-shadow(0 0 10px var(--theme-accent))' }} />
          <circle cx="50" cy="50" r="1.2" fill="var(--theme-text)" />
          <text x="50" y="56" textAnchor="middle" className="radar-hub-label">VIP · 10.10.40.20</text>
          {/* Nodes */}
          {positionedNodes.map((pos) => {
            const color = TIER_COLOR[pos.node.tier];
            const swept = sweptIds.has(pos.node.id);
            const r = 1.4 + (pos.node.health / 100) * 0.7;
            return (
              <g key={pos.node.id} className={`radar-node tier-${pos.node.tier} status-${pos.node.status} ${swept ? 'is-swept' : ''}`}>
                <circle cx={pos.x} cy={pos.y} r={r * 2.2} fill="none" stroke={color} strokeWidth="0.2" opacity={swept ? 0.85 : 0.4}>
                  {swept && (
                    <>
                      <animate attributeName="r" values={`${r * 2.2};${r * 4.4};${r * 2.2}`} dur="1.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.85;0;0.85" dur="1.6s" repeatCount="indefinite" />
                    </>
                  )}
                </circle>
                <circle cx={pos.x} cy={pos.y} r={r} fill={color} style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }} />
                <text x={pos.x} y={pos.y - r - 0.6} textAnchor="middle" className="radar-node-label">{pos.node.label}</text>
                <text x={pos.x} y={pos.y + r + 1.7} textAnchor="middle" className="radar-node-stat" style={{ fill: color }}>{pos.node.health}%</text>
              </g>
            );
          })}
        </svg>
        {/* Center digital readout */}
        <div className="radar-readout">
          <span>SWEEP</span>
          <strong>{Math.round(sweepDeg)}°</strong>
          <small>{nodes.length} nodes · {chords.length} chords</small>
        </div>
      </div>

      {/* Right rail — top talkers + flagged nodes */}
      <aside className="radar-rail radar-rail-right" aria-label="Top talkers and flagged nodes">
        <header>
          <span className="tim-kicker">TOP TALKERS</span>
        </header>
        <ul>
          {topTalkers.map((node) => {
            const color = TIER_COLOR[node.tier];
            const max = topTalkers[0]?.throughput ?? 1;
            const pct = (node.throughput / max) * 100;
            return (
              <li key={node.id} className={`radar-talker tier-${node.tier}`}>
                <header>
                  <strong>{node.label}</strong>
                  <b style={{ color }}>{node.throughput.toLocaleString()}</b>
                </header>
                <div className="radar-bar">
                  <i style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
                </div>
                <small>p95 {node.p95Ms} ms · err {node.errorPct.toFixed(2)}%</small>
              </li>
            );
          })}
        </ul>
        <header style={{ marginTop: '0.4rem' }}>
          <span className="tim-kicker">FLAGGED · {flagged.length}</span>
        </header>
        <ul>
          {flagged.map((node) => (
            <li key={node.id} className="radar-flagged">
              <strong>{node.label}</strong>
              <em className={node.errorPct > 0.3 ? 'is-warn' : 'is-info'}>
                {node.errorPct > 0.3 ? `err ${node.errorPct.toFixed(2)}%` : node.status}
              </em>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/* -------------------- 3D isometric cluster map (city-skyline style) -------------------- */

interface City3DNode {
  id: string;
  label: string;
  /** Floor coordinates 0..100 */
  x: number;
  y: number;
  /** Activity / load 0..100 — drives pillar height */
  load: number;
  kind: 'control' | 'compute' | 'storage' | 'edge' | 'vcluster';
  status: 'online' | 'syncing' | 'watch' | 'draining';
}

interface City3DEdge {
  from: string;
  to: string;
  channel: 'mgmt' | 'storage' | 'mesh' | 'vm' | 'gitops';
  load: number;
}

interface Cluster3DMapProps {
  nodes: City3DNode[];
  edges: City3DEdge[];
  snapshot?: EnvironmentSnapshot;
  height?: number;
}

/** Project an (x, y, z) point into 2D screen space using a classic isometric
 * projection. Floor coordinates run 0..100 on both axes; positive z rises
 * out of the floor toward the viewer. Returns [sx, sy] suitable for an SVG
 * viewBox of 220 × 130. */
function projectIso(x: number, y: number, z: number): [number, number] {
  // Center the floor around (50, 50) so nodes spread evenly
  const cx = x - 50;
  const cy = y - 50;
  const sx = 110 + (cx - cy) * 0.85;
  const sy = 90 + (cx + cy) * 0.42 - z;
  return [sx, sy];
}

/** Draws a 3D pillar (isometric box) representing a node, with a glowing
 * top cap and a base shadow ring. Pillar height is driven by `node.load`. */
function IsoPillar({ node, snapshot }: { node: City3DNode; snapshot?: EnvironmentSnapshot }) {
  const seed = snapshot?.tick ?? 0;
  const heightUnits = 6 + (node.load / 100) * 32;
  const pulse = 1 + Math.sin((seed + node.x) / 4) * 0.08;
  const baseHalf = 3.2;
  // Bottom-floor corners
  const a0 = projectIso(node.x - baseHalf, node.y - baseHalf, 0);
  const b0 = projectIso(node.x + baseHalf, node.y - baseHalf, 0);
  const c0 = projectIso(node.x + baseHalf, node.y + baseHalf, 0);
  const d0 = projectIso(node.x - baseHalf, node.y + baseHalf, 0);
  // Top corners
  const a1 = projectIso(node.x - baseHalf, node.y - baseHalf, heightUnits);
  const b1 = projectIso(node.x + baseHalf, node.y - baseHalf, heightUnits);
  const c1 = projectIso(node.x + baseHalf, node.y + baseHalf, heightUnits);
  const d1 = projectIso(node.x - baseHalf, node.y + baseHalf, heightUnits);
  // Center top for label
  const top = projectIso(node.x, node.y, heightUnits);
  const base = projectIso(node.x, node.y, 0);
  const fillBase = node.kind === 'storage' ? 'var(--theme-warn)' : node.kind === 'control' ? 'var(--theme-accent-2)' : node.kind === 'edge' ? 'var(--theme-good)' : node.kind === 'vcluster' ? 'var(--theme-channel-gitops)' : 'var(--theme-accent)';
  return (
    <g className={`iso-pillar kind-${node.kind} status-${node.status}`}>
      {/* Right face */}
      <polygon points={`${b0[0]},${b0[1]} ${c0[0]},${c0[1]} ${c1[0]},${c1[1]} ${b1[0]},${b1[1]}`} fill={fillBase} fillOpacity="0.18" stroke={fillBase} strokeWidth="0.25" strokeOpacity="0.6" />
      {/* Front face */}
      <polygon points={`${a0[0]},${a0[1]} ${b0[0]},${b0[1]} ${b1[0]},${b1[1]} ${a1[0]},${a1[1]}`} fill={fillBase} fillOpacity="0.32" stroke={fillBase} strokeWidth="0.25" strokeOpacity="0.85" />
      {/* Left face (slightly hidden) */}
      <polygon points={`${a0[0]},${a0[1]} ${d0[0]},${d0[1]} ${d1[0]},${d1[1]} ${a1[0]},${a1[1]}`} fill={fillBase} fillOpacity="0.1" stroke={fillBase} strokeWidth="0.2" strokeOpacity="0.4" />
      {/* Top cap */}
      <polygon points={`${a1[0]},${a1[1]} ${b1[0]},${b1[1]} ${c1[0]},${c1[1]} ${d1[0]},${d1[1]}`} fill={fillBase} fillOpacity="0.7" stroke={fillBase} strokeWidth="0.4" style={{ filter: `drop-shadow(0 0 3px ${fillBase}) drop-shadow(0 0 8px ${fillBase})` }} />
      {/* Vertical light beam emerging from the top */}
      <line x1={top[0]} y1={top[1]} x2={top[0]} y2={top[1] - 8 * pulse} stroke={fillBase} strokeWidth="0.6" opacity="0.7" style={{ filter: `drop-shadow(0 0 3px ${fillBase})` }} />
      <circle cx={top[0]} cy={top[1] - 8 * pulse} r="0.7" fill={fillBase} style={{ filter: `drop-shadow(0 0 3px ${fillBase})` }} />
      {/* Base ripple ring */}
      <ellipse cx={base[0]} cy={base[1]} rx={baseHalf * 1.6} ry={baseHalf * 0.8} fill="none" stroke={fillBase} strokeWidth="0.3" opacity="0.7">
        <animate attributeName="rx" values={`${baseHalf * 1.6};${baseHalf * 3.2};${baseHalf * 1.6}`} dur="3s" repeatCount="indefinite" begin={`${node.x * 0.04}s`} />
        <animate attributeName="ry" values={`${baseHalf * 0.8};${baseHalf * 1.6};${baseHalf * 0.8}`} dur="3s" repeatCount="indefinite" begin={`${node.x * 0.04}s`} />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="3s" repeatCount="indefinite" begin={`${node.x * 0.04}s`} />
      </ellipse>
      {/* Top label */}
      <text x={top[0]} y={top[1] - 11} className="iso-node-label" textAnchor="middle">{node.label}</text>
      <text x={top[0]} y={top[1] - 7} className="iso-node-load" textAnchor="middle">{node.load}%</text>
    </g>
  );
}

/** 3D isometric cluster map — replaces the flat 2D RouteMap with a
 * city-skyline-style floor of glowing pillars whose heights track each
 * node's activity. Routes flow as glowing light particles along the floor
 * between pillars, with periodic activity ripples and a central globe. */
export function Cluster3DMap({ nodes, edges, snapshot, height = 360 }: Cluster3DMapProps) {
  const map = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const seed = snapshot?.tick ?? 0;

  // Sort pillars back-to-front so closer pillars overlap distant ones
  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.x + a.y - (b.x + b.y)), [nodes]);

  // Pre-compute floor grid lines
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let i = 0; i <= 10; i += 1) {
      const t = i * 10;
      const major = i % 5 === 0;
      // X-direction (constant y)
      const a = projectIso(0, t, 0);
      const b = projectIso(100, t, 0);
      lines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], major });
      // Y-direction (constant x)
      const c = projectIso(t, 0, 0);
      const d = projectIso(t, 100, 0);
      lines.push({ x1: c[0], y1: c[1], x2: d[0], y2: d[1], major });
    }
    return lines;
  }, []);

  // Compute connection arcs along the floor
  const connections = useMemo(() => {
    return edges
      .map((edge) => {
        const a = map.get(edge.from);
        const b = map.get(edge.to);
        if (!a || !b) return null;
        const start = projectIso(a.x, a.y, 0);
        const end = projectIso(b.x, b.y, 0);
        // Add a slight upward arc for the curve
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const mid = projectIso(midX, midY, 4);
        const path = `M${start[0]} ${start[1]} Q ${mid[0]} ${mid[1]} ${end[0]} ${end[1]}`;
        return { ...edge, path, start, end };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null);
  }, [edges, map]);

  // Central globe position (roughly center of floor)
  const globeCenter = projectIso(50, 50, 18);

  return (
    <div className="cluster-3d-map" style={{ height }}>
      <svg viewBox="0 0 220 130" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="iso-floor-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.55" />
            <stop offset="60%" stopColor="var(--theme-accent-soft)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="iso-horizon" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-accent-2)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="var(--theme-warn)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="iso-globe" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-accent-2)" />
            <stop offset="50%" stopColor="var(--theme-accent)" />
            <stop offset="100%" stopColor="var(--theme-warn)" />
          </linearGradient>
        </defs>
        {/* Sky horizon glow (warm amber band like the reference image) */}
        <rect x="0" y="0" width="220" height="60" fill="url(#iso-horizon)" />
        {/* Floor radial highlight */}
        <ellipse cx="110" cy="90" rx="100" ry="40" fill="url(#iso-floor-glow)" />
        {/* Floor grid */}
        {gridLines.map((line, idx) => (
          <line
            key={idx}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="var(--theme-grid)"
            strokeWidth={line.major ? 0.35 : 0.18}
            opacity={line.major ? 0.7 : 0.45}
          />
        ))}
        {/* Floor edge box */}
        {(() => {
          const c1 = projectIso(0, 0, 0);
          const c2 = projectIso(100, 0, 0);
          const c3 = projectIso(100, 100, 0);
          const c4 = projectIso(0, 100, 0);
          return (
            <polygon points={`${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${c3[0]},${c3[1]} ${c4[0]},${c4[1]}`} fill="none" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.7" />
          );
        })()}
        {/* Connection arcs along the floor */}
        {connections.map((edge, idx) => {
          const color = `var(--theme-channel-${edge.channel})`;
          return (
            <g key={`${edge.from}-${edge.to}-${idx}`} className={`iso-edge channel-${edge.channel}`}>
              <path d={edge.path} stroke={color} strokeWidth="0.6" fill="none" opacity="0.35" />
              <path
                d={edge.path}
                stroke={color}
                strokeWidth="0.7"
                fill="none"
                strokeDasharray="2 4"
                style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})` }}
              >
                <animate attributeName="stroke-dashoffset" values="0;-12" dur={`${3 + (idx % 3)}s`} repeatCount="indefinite" />
              </path>
              <circle r="0.7" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
                <animateMotion dur={`${4 + (idx % 4)}s`} repeatCount="indefinite" path={edge.path} begin={`${idx * 0.3}s`} />
              </circle>
              <circle r="0.5" fill={color} opacity="0.6">
                <animateMotion dur={`${4 + (idx % 4)}s`} repeatCount="indefinite" path={edge.path} begin={`${idx * 0.3 + 0.6}s`} />
              </circle>
            </g>
          );
        })}
        {/* Central rotating wireframe globe — floats above the floor */}
        <g className="iso-globe" transform={`translate(${globeCenter[0]} ${globeCenter[1]})`}>
          <circle r="6" fill="rgba(0,0,0,0.4)" stroke="url(#iso-globe)" strokeWidth="0.4" />
          <ellipse cx="0" cy="0" rx="6" ry="2.4" fill="none" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.8">
            <animateTransform attributeName="transform" type="rotate" values="0;360" dur="14s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx="0" cy="0" rx="2.4" ry="6" fill="none" stroke="var(--theme-accent-2)" strokeWidth="0.3" opacity="0.7">
            <animateTransform attributeName="transform" type="rotate" values="360;0" dur="18s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx="0" cy="0" rx="5" ry="5" fill="none" stroke="var(--theme-warn)" strokeWidth="0.25" opacity="0.4">
            <animate attributeName="rx" values="4;6;4" dur="3s" repeatCount="indefinite" />
            <animate attributeName="ry" values="6;4;6" dur="3s" repeatCount="indefinite" />
          </ellipse>
          {/* Twinkle dots */}
          {Array.from({ length: 7 }).map((_, idx) => {
            const a = (idx / 7) * Math.PI * 2 + seed * 0.01;
            return (
              <circle key={idx} cx={Math.cos(a) * 5.5} cy={Math.sin(a) * 2.2} r="0.4" fill="var(--theme-accent)" opacity={0.6 + Math.sin(seed / 3 + idx) * 0.4}>
                <animate attributeName="opacity" values="0.3;1;0.3" dur={`${2 + idx * 0.3}s`} repeatCount="indefinite" />
              </circle>
            );
          })}
          <text x="0" y="-9" className="iso-globe-label" textAnchor="middle">CLUSTER CORE</text>
        </g>
        {/* Pillars */}
        {sortedNodes.map((node) => (
          <IsoPillar key={node.id} node={node} snapshot={snapshot} />
        ))}
        {/* Sweep light at the front */}
        <line x1="20" y1="120" x2="200" y2="120" stroke="var(--theme-accent)" strokeWidth="0.6" opacity="0.6">
          <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3s" repeatCount="indefinite" />
        </line>
      </svg>
      <div className="cluster-3d-legend">
        <span className="iso-leg kind-control"><i />control-plane</span>
        <span className="iso-leg kind-edge"><i />edge</span>
        <span className="iso-leg kind-compute"><i />compute</span>
        <span className="iso-leg kind-storage"><i />storage</span>
        <span className="iso-leg kind-vcluster"><i />vcluster</span>
        <span className="iso-leg-meta">tick #{snapshot?.tick ?? 0} · {nodes.length} nodes · {edges.length} routes</span>
      </div>
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

/* ============================================================
   HUD widget primitives v2.3 — more bars, meters, gauges,
   richer graph detail, frosted glass styling.
   ============================================================ */

/* -------------------- Vertical meter bank -------------------- */

interface VerticalMeter {
  label: string;
  value: number;
  unit?: string;
  threshold?: number;
}

interface VerticalMeterBankProps {
  meters: VerticalMeter[];
  height?: number;
  scale?: number;
}

/** Audio-style vertical level meter bank — each column shows ticks, a peak indicator,
 * and the live value, with red zone above the threshold. */
export function VerticalMeterBank({ meters, height = 160, scale = 100 }: VerticalMeterBankProps) {
  return (
    <div className="vert-meter-bank" style={{ height }}>
      {meters.map((meter) => {
        const fill = Math.max(2, Math.min(100, (meter.value / scale) * 100));
        const thresholdLine = meter.threshold ? (meter.threshold / scale) * 100 : 80;
        return (
          <div key={meter.label} className="vert-meter">
            <div className="vert-meter-track" aria-label={meter.label}>
              {Array.from({ length: 16 }).map((_, idx) => (
                <i key={idx} className="vert-meter-tick" style={{ bottom: `${(idx / 15) * 100}%` }} />
              ))}
              <span className="vert-meter-fill" style={{ height: `${fill}%` }} />
              <span className="vert-meter-peak" style={{ bottom: `${fill}%` }} />
              <span className="vert-meter-threshold" style={{ bottom: `${thresholdLine}%` }} />
            </div>
            <small>{meter.label}</small>
            <b>{Math.round(meter.value)}{meter.unit ?? ''}</b>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Horizontal bar cluster -------------------- */

interface HorizontalBar {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  detail?: string;
  status?: 'good' | 'warn' | 'danger';
}

interface HorizontalBarClusterProps {
  bars: HorizontalBar[];
  scale?: number;
}

/** Cluster of horizontal bars with label, value, delta arrow, and a sub-detail line.
 * Used for "top N by X" style breakdowns where you want a quick visual ranking. */
export function HorizontalBarCluster({ bars, scale }: HorizontalBarClusterProps) {
  const inferredScale = scale ?? Math.max(...bars.map((b) => b.value));
  return (
    <ul className="hbar-cluster">
      {bars.map((bar) => {
        const pct = Math.max(2, Math.min(100, (bar.value / inferredScale) * 100));
        const deltaCls = bar.delta === undefined || bar.delta === 0 ? '' : bar.delta > 0 ? ' delta-up' : ' delta-down';
        return (
          <li key={bar.label} className={`hbar-row status-${bar.status ?? 'neutral'}${deltaCls}`}>
            <div className="hbar-label">
              <strong>{bar.label}</strong>
              {bar.detail && <small>{bar.detail}</small>}
            </div>
            <div className="hbar-track">
              <i style={{ width: `${pct}%` }} />
              <span className="hbar-tickline" />
            </div>
            <div className="hbar-value">
              <b>{bar.value.toLocaleString()}{bar.unit && <em>{bar.unit}</em>}</b>
              {bar.delta !== undefined && bar.delta !== 0 && (
                <small>{bar.delta > 0 ? '▲' : '▼'} {Math.abs(bar.delta).toFixed(0)}</small>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------- Semicircular dial gauge -------------------- */

interface DialGaugeProps {
  value: number; // 0 - max
  max?: number;
  label: string;
  unit?: string;
  status?: 'good' | 'warn' | 'danger' | 'neutral';
  bands?: { from: number; to: number; color: string }[];
  size?: number;
}

/** Semicircular dial gauge with needle, range bands, tick marks, and digital readout. */
export function DialGauge({ value, max = 100, label, unit, status = 'neutral', bands, size = 160 }: DialGaugeProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const angle = (clamped / max) * 180 - 90;
  const accent = status === 'good' ? 'var(--theme-good)' : status === 'warn' ? 'var(--theme-warn)' : status === 'danger' ? 'var(--theme-danger)' : 'var(--theme-accent)';
  const cx = 50;
  const cy = 60;
  const r = 40;
  return (
    <div className="dial-gauge" style={{ width: size }}>
      <svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
        {/* range bands */}
        {bands?.map((band, idx) => {
          const startAngle = (band.from / max) * Math.PI - Math.PI;
          const endAngle = (band.to / max) * Math.PI - Math.PI;
          const x1 = cx + Math.cos(startAngle) * r;
          const y1 = cy + Math.sin(startAngle) * r;
          const x2 = cx + Math.cos(endAngle) * r;
          const y2 = cy + Math.sin(endAngle) * r;
          const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
          return (
            <path
              key={idx}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              stroke={band.color}
              strokeWidth="3"
              fill="none"
              opacity="0.45"
            />
          );
        })}
        {/* baseline arc */}
        <path d={`M 10 60 A 40 40 0 0 1 90 60`} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" strokeLinecap="round" />
        {/* fill arc */}
        <path
          d={`M 10 60 A 40 40 0 0 1 90 60`}
          stroke={accent}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${Math.PI * r}`}
          strokeDashoffset={Math.PI * r - (clamped / max) * Math.PI * r}
          style={{ filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 10px ${accent})` }}
        />
        {/* tick marks */}
        {Array.from({ length: 11 }).map((_, idx) => {
          const tickAngle = (idx / 10) * Math.PI - Math.PI;
          const r1 = 44;
          const r2 = idx % 5 === 0 ? 36 : 40;
          return (
            <line
              key={idx}
              x1={cx + Math.cos(tickAngle) * r1}
              y1={cy + Math.sin(tickAngle) * r1}
              x2={cx + Math.cos(tickAngle) * r2}
              y2={cy + Math.sin(tickAngle) * r2}
              stroke={idx % 5 === 0 ? accent : 'var(--theme-text-dim)'}
              strokeWidth={idx % 5 === 0 ? 0.7 : 0.4}
              opacity={idx % 5 === 0 ? 0.85 : 0.4}
            />
          );
        })}
        {/* needle */}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - 34} stroke={accent} strokeWidth="1.6" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
          <circle cx={cx} cy={cy} r="2.4" fill={accent} style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
        </g>
        {/* min/max labels */}
        <text x="8" y="68" className="dial-tick-label" textAnchor="middle">0</text>
        <text x="50" y="14" className="dial-tick-label" textAnchor="middle">{Math.round(max / 2)}</text>
        <text x="92" y="68" className="dial-tick-label" textAnchor="middle">{max}</text>
      </svg>
      <div className="dial-readout">
        <strong style={{ color: accent }}>{Math.round(clamped)}{unit && <em>{unit}</em>}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/* -------------------- Annotated oscilloscope (richer graph) -------------------- */

interface AnnotatedOscilloscopeProps {
  channels: { label: string; color?: string; series: number[]; unit?: string }[];
  snapshot?: EnvironmentSnapshot;
  height?: number;
  yMax?: number;
  yMin?: number;
  divisionsX?: number;
  divisionsY?: number;
  timeScale?: string;
  voltScale?: string;
}

/** Oscilloscope with X/Y axis ticks, division labels, per-channel readouts
 * (min/avg/max/peak), and time/volt scale annotations like a real scope. */
export function AnnotatedOscilloscope({
  channels,
  snapshot,
  height = 200,
  yMax = 100,
  yMin = 0,
  divisionsX = 10,
  divisionsY = 8,
  timeScale = '1.6 s / div',
  voltScale = '12.5 % / div',
}: AnnotatedOscilloscopeProps) {
  const range = yMax - yMin;
  const seriesLen = Math.max(...channels.map((c) => c.series.length));
  const seed = snapshot?.tick ?? 0;
  return (
    <div className="osc-annotated" style={{ height }}>
      <svg viewBox="0 0 220 110" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="osc-anno-grid" width="20" height="11" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 11" fill="none" stroke="var(--theme-grid)" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect x="20" y="2" width="200" height="100" fill="url(#osc-anno-grid)" opacity="0.6" />
        {/* major divisions */}
        {Array.from({ length: divisionsX + 1 }).map((_, idx) => (
          <line
            key={`vx-${idx}`}
            x1={20 + (idx / divisionsX) * 200}
            y1="2"
            x2={20 + (idx / divisionsX) * 200}
            y2="102"
            stroke="var(--theme-accent-soft)"
            strokeWidth="0.35"
            strokeDasharray="1.5 2"
          />
        ))}
        {Array.from({ length: divisionsY + 1 }).map((_, idx) => (
          <line
            key={`hy-${idx}`}
            x1="20"
            y1={2 + (idx / divisionsY) * 100}
            x2="220"
            y2={2 + (idx / divisionsY) * 100}
            stroke="var(--theme-accent-soft)"
            strokeWidth="0.35"
            strokeDasharray="1.5 2"
          />
        ))}
        {/* y-axis tick labels */}
        {Array.from({ length: divisionsY + 1 }).map((_, idx) => (
          <text
            key={`yl-${idx}`}
            x="17"
            y={102 - (idx / divisionsY) * 100 + 1.5}
            className="osc-axis-label"
            textAnchor="end"
          >
            {Math.round(yMin + (idx / divisionsY) * range)}
          </text>
        ))}
        {/* x-axis tick labels */}
        {Array.from({ length: divisionsX + 1 }).map((_, idx) => (
          <text
            key={`xl-${idx}`}
            x={20 + (idx / divisionsX) * 200}
            y="108"
            className="osc-axis-label"
            textAnchor="middle"
          >
            t-{divisionsX - idx}
          </text>
        ))}
        {/* zero line */}
        <line x1="20" y1="52" x2="220" y2="52" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.7" strokeDasharray="2 2" />
        {/* channels */}
        {channels.map((channel, channelIdx) => {
          const color = channel.color ?? ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)'][channelIdx % 4];
          const points = channel.series
            .map((value, idx) => {
              const x = 20 + (idx / (seriesLen - 1)) * 200;
              const y = 102 - ((value - yMin) / range) * 100;
              return `${x},${Math.max(2, Math.min(102, y))}`;
            })
            .join(' ');
          const peakValue = Math.max(...channel.series);
          const peakIdx = channel.series.indexOf(peakValue);
          const peakX = 20 + (peakIdx / (seriesLen - 1)) * 200;
          const peakY = 102 - ((peakValue - yMin) / range) * 100;
          return (
            <g key={channelIdx} className="osc-anno-channel">
              <polyline points={points} fill="none" stroke={color} strokeWidth="0.5" opacity="0.25" style={{ filter: 'blur(2px)' }} />
              <polyline points={points} fill="none" stroke={color} strokeWidth="0.85" style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 6px ${color})` }} />
              <circle cx={peakX} cy={peakY} r="1.2" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
              <text x={peakX} y={peakY - 2.5} fill={color} className="osc-peak-label" textAnchor="middle">peak {Math.round(peakValue)}</text>
            </g>
          );
        })}
        {/* sweep cursor */}
        <line x1={20 + ((seed % 10) / 10) * 200} y1="2" x2={20 + ((seed % 10) / 10) * 200} y2="102" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.5" />
      </svg>
      <div className="osc-anno-meta">
        <span>TIME · {timeScale}</span>
        <span>VOLT · {voltScale}</span>
        <span>BW · 200 MHz</span>
        <span>SAMP · 62.5 ms/pt</span>
      </div>
      <div className="osc-anno-readouts">
        {channels.map((channel, channelIdx) => {
          const stats = computeStats(channel.series);
          const color = channel.color ?? ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)'][channelIdx % 4];
          return (
            <div key={channelIdx} className="osc-anno-readout" style={{ borderLeftColor: color }}>
              <header>
                <i style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <strong style={{ color }}>CH{channelIdx + 1} · {channel.label}</strong>
              </header>
              <dl>
                <div><dt>MIN</dt><dd>{stats.min.toFixed(1)}{channel.unit}</dd></div>
                <div><dt>AVG</dt><dd>{stats.avg.toFixed(1)}{channel.unit}</dd></div>
                <div><dt>MAX</dt><dd>{stats.max.toFixed(1)}{channel.unit}</dd></div>
                <div><dt>NOW</dt><dd style={{ color }}>{stats.current.toFixed(1)}{channel.unit}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- Annotated FFT spectrum (with frequency band labels) -------------------- */

interface AnnotatedFftProps {
  snapshot?: EnvironmentSnapshot;
  bars?: number;
  height?: number;
  freqLabels?: string[];
}

export function AnnotatedFft({ snapshot, bars = 64, height = 160, freqLabels = ['0', '125 MHz', '250 MHz', '500 MHz', '1 GHz', '2 GHz', '4 GHz'] }: AnnotatedFftProps) {
  const seed = snapshot?.tick ?? 0;
  const values = useMemo(() => {
    return Array.from({ length: bars }, (_, idx) => {
      const phase = (seed + idx) / 4;
      const decay = 1 - Math.pow(idx / bars, 1.3);
      const peakBoost = idx === Math.floor(bars * 0.18) || idx === Math.floor(bars * 0.42) ? 1.4 : 1;
      const v = (Math.sin(phase * 1.4 + idx * 0.3) * 0.4 + Math.sin(phase * 0.7 + idx * 0.12) * 0.5 + 0.5) * decay * peakBoost * 100;
      return Math.max(6, Math.min(98, Math.round(v + (Math.random() * 8 - 4))));
    });
  }, [seed, bars]);
  const peak = Math.max(...values);
  const peakIdx = values.indexOf(peak);
  return (
    <div className="fft-annotated" style={{ height }}>
      <div className="fft-anno-yaxis">
        <span>0 dB</span>
        <span>-10</span>
        <span>-20</span>
        <span>-30</span>
        <span>-40</span>
      </div>
      <div className="fft-anno-plot">
        <div className="fft-anno-bars">
          {values.map((value, idx) => {
            const isPeak = idx === peakIdx;
            return (
              <span key={idx} className={`fft-bar ${isPeak ? 'is-peak' : ''}`} style={{ height: `${value}%`, animationDelay: `${idx * 12}ms` } as CSSProperties}>
                <i style={{ height: '100%' }} />
                {isPeak && <em>peak</em>}
              </span>
            );
          })}
        </div>
        <div className="fft-anno-xaxis">
          {freqLabels.map((label, idx) => (
            <span key={idx} style={{ left: `${(idx / (freqLabels.length - 1)) * 100}%` }}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Annotated latency histogram (with mean/median/P50/P95/P99) -------------------- */

export interface LatencyDatum {
  label: string;
  value: number;
  highlight?: 'mean' | 'p50' | 'p95' | 'p99';
}

interface AnnotatedLatencyHistogramProps {
  buckets: LatencyDatum[];
  height?: number;
  yUnit?: string;
  summary?: { p50: string; p95: string; p99: string; mean: string };
}

export function AnnotatedLatencyHistogram({ buckets, height = 170, yUnit = '%', summary }: AnnotatedLatencyHistogramProps) {
  const max = Math.max(...buckets.map((b) => b.value));
  return (
    <div className="lat-annotated">
      <div className="lat-anno-yaxis">
        <span>{max}{yUnit}</span>
        <span>{Math.round(max * 0.75)}{yUnit}</span>
        <span>{Math.round(max * 0.5)}{yUnit}</span>
        <span>{Math.round(max * 0.25)}{yUnit}</span>
        <span>0</span>
      </div>
      <div className="lat-anno-plot" style={{ height }}>
        {buckets.map((bucket) => {
          const pct = (bucket.value / max) * 100;
          return (
            <div key={bucket.label} className={`lat-anno-col ${bucket.highlight ? `is-${bucket.highlight}` : ''}`}>
              <div className="lat-anno-bar">
                <i style={{ height: `${pct}%` }} />
                {bucket.highlight && <em>{bucket.highlight.toUpperCase()}</em>}
                <b>{bucket.value}</b>
              </div>
              <small>{bucket.label}</small>
            </div>
          );
        })}
      </div>
      {summary && (
        <div className="lat-anno-summary">
          <div><span>MEAN</span><strong>{summary.mean}</strong></div>
          <div><span>P50</span><strong>{summary.p50}</strong></div>
          <div className="is-warn"><span>P95</span><strong>{summary.p95}</strong></div>
          <div className="is-danger"><span>P99</span><strong>{summary.p99}</strong></div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Bar cluster with grouped percentile markers -------------------- */

interface PercentileBarProps {
  label: string;
  p50: number;
  p95: number;
  p99: number;
  unit?: string;
  scale?: number;
}

export function PercentileBar({ label, p50, p95, p99, unit = 'µs', scale = 200 }: PercentileBarProps) {
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className="pctile-bar">
      <header>
        <strong>{label}</strong>
        <span>{p50}{unit} / {p95}{unit} / {p99}{unit}</span>
      </header>
      <div className="pctile-track">
        <i className="pctile-mid" style={{ width: pos(p99) }} />
        <span className="pctile-mark mark-p50" style={{ left: pos(p50) }}>P50</span>
        <span className="pctile-mark mark-p95" style={{ left: pos(p95) }}>P95</span>
        <span className="pctile-mark mark-p99" style={{ left: pos(p99) }}>P99</span>
      </div>
    </div>
  );
}

/* -------------------- Compact "stat grid" - dense metric tiles -------------------- */

export interface StatGridItem {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  status?: 'good' | 'warn' | 'danger' | 'neutral';
  delta?: number;
}

/* -------------------- Activity heatmap (workload density per node) -------------------- */

interface ActivityHeatmapProps {
  rows: { label: string; cells: number[] }[];
  cols?: number;
  cellTitle?: (rowLabel: string, colIndex: number, value: number) => string;
}

export function ActivityHeatmap({ rows, cellTitle }: ActivityHeatmapProps) {
  return (
    <div className="activity-heatmap">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `120px repeat(${rows[0]?.cells.length ?? 12}, 1fr)` }}>
        <span className="heatmap-corner">/</span>
        {Array.from({ length: rows[0]?.cells.length ?? 12 }).map((_, idx) => (
          <span key={`h-${idx}`} className="heatmap-col-label">t-{(rows[0]?.cells.length ?? 12) - 1 - idx}</span>
        ))}
        {rows.map((row) => (
          <>
            <span key={`r-${row.label}`} className="heatmap-row-label">{row.label}</span>
            {row.cells.map((value, idx) => {
              const intensity = Math.max(0, Math.min(1, value / 100));
              const cellClass = intensity > 0.85 ? 'is-hot' : intensity > 0.6 ? 'is-warm' : intensity > 0.3 ? 'is-mid' : 'is-cool';
              return (
                <span
                  key={`${row.label}-${idx}`}
                  className={`heatmap-cell ${cellClass}`}
                  style={{ opacity: 0.25 + intensity * 0.75 }}
                  title={cellTitle ? cellTitle(row.label, idx, value) : `${row.label} · ${value}%`}
                />
              );
            })}
          </>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-cell is-cool" />
        <span>cool</span>
        <span className="heatmap-cell is-mid" />
        <span>mid</span>
        <span className="heatmap-cell is-warm" />
        <span>warm</span>
        <span className="heatmap-cell is-hot" />
        <span>hot</span>
      </div>
    </div>
  );
}

/* -------------------- Sparkline grid (many sparklines, compact) -------------------- */

interface SparklineGridItem {
  label: string;
  values: number[];
  current: number;
  unit?: string;
  status?: 'good' | 'warn' | 'danger';
}

export function SparklineGrid({ items, columns = 3 }: { items: SparklineGridItem[]; columns?: number }) {
  return (
    <div className="sparkgrid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item) => (
        <div key={item.label} className={`sparkgrid-cell status-${item.status ?? 'neutral'}`}>
          <header>
            <span>{item.label}</span>
            <b>{item.current}{item.unit && <em>{item.unit}</em>}</b>
          </header>
          <Sparkline values={item.values} height={22} />
        </div>
      ))}
    </div>
  );
}

/* -------------------- Ring meter cluster (compact ring gauges) -------------------- */

interface RingMeter {
  label: string;
  value: number;
  unit?: string;
  status?: 'good' | 'warn' | 'danger';
}

export function RingMeterCluster({ meters, size = 88 }: { meters: RingMeter[]; size?: number }) {
  return (
    <div className="ring-meter-cluster">
      {meters.map((meter) => {
        const r = 40;
        const c = 2 * Math.PI * r;
        const offset = c * (1 - Math.max(0, Math.min(100, meter.value)) / 100);
        const accent = meter.status === 'warn' ? 'var(--theme-warn)' : meter.status === 'danger' ? 'var(--theme-danger)' : 'var(--theme-accent)';
        return (
          <div key={meter.label} className="ring-meter" style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={accent}
                strokeWidth="6"
                strokeDasharray={`${c}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 10px ${accent})` }}
              />
              <text x="50" y="46" textAnchor="middle" className="ring-meter-value" fill={accent}>{Math.round(meter.value)}</text>
              <text x="50" y="62" textAnchor="middle" className="ring-meter-unit">{meter.unit ?? '%'}</text>
            </svg>
            <small>{meter.label}</small>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Anomaly stream (3-channel anomaly score timeline) -------------------- */

interface AnomalyStreamProps {
  snapshot?: EnvironmentSnapshot;
  height?: number;
}

export function AnomalyStream({ snapshot, height = 110 }: AnomalyStreamProps) {
  const seed = snapshot?.tick ?? 0;
  const series = useMemo(() => {
    const buildAnomaly = (offset: number, spikeMod: number, base: number) =>
      Array.from({ length: 64 }, (_, idx) => {
        const phase = (seed + idx + offset) / 5;
        const spike = (seed + idx) % spikeMod === 0 ? 30 : 0;
        return Math.max(0, Math.min(100, base + Math.sin(phase) * 8 + spike + Math.random() * 4));
      });
    return {
      auth: buildAnomaly(0, 17, 18),
      net: buildAnomaly(7, 23, 22),
      io: buildAnomaly(14, 31, 28),
    };
  }, [seed]);
  return (
    <div className="anomaly-stream" style={{ height }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="anomaly-fill-auth" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="anomaly-fill-net" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--theme-accent-2)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="anomaly-fill-io" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--theme-warn)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--theme-warn)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* threshold line */}
        <line x1="0" y1="30" x2="200" y2="30" stroke="var(--theme-danger)" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.5" />
        <text x="2" y="28" className="anomaly-axis-label" fill="var(--theme-danger)">THRESHOLD 70</text>
        {(Object.entries(series) as [string, number[]][]).map(([key, values], channelIdx) => {
          const color = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-warn)'][channelIdx];
          const fill = `url(#anomaly-fill-${key})`;
          const points = values.map((v, i) => `${(i / (values.length - 1)) * 200},${100 - v}`).join(' ');
          return (
            <g key={key}>
              <polyline points={`0,100 ${points} 200,100`} fill={fill} />
              <polyline points={points} fill="none" stroke={color} strokeWidth="0.7" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
            </g>
          );
        })}
      </svg>
      <div className="anomaly-legend">
        <span><i style={{ background: 'var(--theme-accent)' }} />AUTH {series.auth[series.auth.length - 1].toFixed(0)}</span>
        <span><i style={{ background: 'var(--theme-accent-2)' }} />NET {series.net[series.net.length - 1].toFixed(0)}</span>
        <span><i style={{ background: 'var(--theme-warn)' }} />IO {series.io[series.io.length - 1].toFixed(0)}</span>
      </div>
    </div>
  );
}

/* -------------------- GitOps sync state bank -------------------- */

interface GitOpsTargetMini {
  name: string;
  provider: string;
  state: 'synced' | 'syncing' | 'drift' | 'failed';
  revision: string;
  ageSec: number;
}

const DEFAULT_GITOPS: GitOpsTargetMini[] = [
  { name: 'platform/observability', provider: 'argocd', state: 'synced', revision: '7f3a2c1', ageSec: 38 },
  { name: 'fintech/payments', provider: 'argocd', state: 'drift', revision: '912ad88', ageSec: 220 },
  { name: 'edge/registry-cache', provider: 'flux', state: 'syncing', revision: '4c1ee20', ageSec: 8 },
  { name: 'tenant-a/release', provider: 'jenkins-x', state: 'failed', revision: 'aa1f203', ageSec: 612 },
  { name: 'edge-a/manifests', provider: 'argocd', state: 'synced', revision: 'b81f0c0', ageSec: 12 },
  { name: 'edge-b/manifests', provider: 'argocd', state: 'synced', revision: 'b81f0c0', ageSec: 14 },
];

export function GitOpsSyncBank({ targets = DEFAULT_GITOPS }: { targets?: GitOpsTargetMini[] }) {
  return (
    <ul className="gitops-sync-bank">
      {targets.map((target) => (
        <li key={target.name} className={`gitops-mini state-${target.state}`}>
          <span className="gitops-state-dot" aria-hidden="true" />
          <div>
            <strong>{target.name}</strong>
            <small>{target.provider} · rev {target.revision} · {target.ageSec}s</small>
          </div>
          <b>{target.state.toUpperCase()}</b>
        </li>
      ))}
    </ul>
  );
}

/* -------------------- GPU memory grid -------------------- */

interface GpuRow {
  id: string;
  label: string;
  memUsedGiB: number;
  memTotalGiB: number;
  utilPercent: number;
  tempC: number;
  bound: string;
}

const DEFAULT_GPUS: GpuRow[] = [
  { id: 'gpu-a100-1', label: 'A100 80G', memUsedGiB: 62, memTotalGiB: 80, utilPercent: 88, tempC: 71, bound: 'analytics-vm' },
  { id: 'gpu-a100-2', label: 'A100 80G', memUsedGiB: 74, memTotalGiB: 80, utilPercent: 92, tempC: 76, bound: 'training-sandbox' },
  { id: 'gpu-a100-3', label: 'A100 80G', memUsedGiB: 78, memTotalGiB: 80, utilPercent: 94, tempC: 78, bound: 'training-sandbox' },
  { id: 'gpu-h100-1', label: 'H100 SXM', memUsedGiB: 58, memTotalGiB: 80, utilPercent: 76, tempC: 68, bound: 'inference-pool' },
  { id: 'gpu-tpu', label: 'Coral TPU', memUsedGiB: 2, memTotalGiB: 4, utilPercent: 41, tempC: 52, bound: 'edge-a inf' },
];

export function GpuMemoryGrid({ gpus = DEFAULT_GPUS }: { gpus?: GpuRow[] }) {
  return (
    <div className="gpu-mem-grid">
      {gpus.map((gpu) => {
        const memPct = (gpu.memUsedGiB / gpu.memTotalGiB) * 100;
        const tempStatus = gpu.tempC > 80 ? 'danger' : gpu.tempC > 70 ? 'warn' : 'good';
        return (
          <div key={gpu.id} className="gpu-row">
            <div className="gpu-head">
              <strong>{gpu.label}</strong>
              <small>{gpu.id} → {gpu.bound}</small>
            </div>
            <div className="gpu-bars">
              <div className="gpu-bar">
                <span>MEM</span>
                <div className="gpu-track"><i style={{ width: `${memPct}%` }} /></div>
                <b>{gpu.memUsedGiB}/{gpu.memTotalGiB} GiB</b>
              </div>
              <div className="gpu-bar">
                <span>UTL</span>
                <div className="gpu-track"><i className="gpu-util" style={{ width: `${gpu.utilPercent}%` }} /></div>
                <b>{gpu.utilPercent}%</b>
              </div>
              <div className={`gpu-temp temp-${tempStatus}`}>
                <span>°C</span>
                <strong>{gpu.tempC}</strong>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- API request rate gauge cluster -------------------- */

interface ApiRateGaugeProps {
  label: string;
  current: number;
  max: number;
  budget: number;
  series: number[];
  unit?: string;
}

export function ApiRateGauge({ label, current, max, budget, series, unit = '/s' }: ApiRateGaugeProps) {
  const pct = (current / max) * 100;
  const budgetPct = (budget / max) * 100;
  const status = current > budget ? 'warn' : 'good';
  return (
    <div className={`api-rate-gauge status-${status}`}>
      <header>
        <strong>{label}</strong>
        <b>{current.toLocaleString()}{unit}</b>
      </header>
      <div className="api-rate-track">
        <span className="api-rate-budget" style={{ left: `${budgetPct}%` }} />
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="api-rate-meta">
        <span>budget {budget}{unit}</span>
        <span>peak {Math.max(...series).toFixed(0)}{unit}</span>
        <span>max {max}{unit}</span>
      </div>
      <Sparkline values={series} height={22} />
    </div>
  );
}

/* -------------------- Workload activity timeline (now-playing strip) -------------------- */

interface ActivityItem {
  id: string;
  channel: string;
  workload: string;
  state: 'running' | 'migrating' | 'snapshot' | 'syncing' | 'building';
  progress: number;
}

const DEFAULT_ACTIVITY: ActivityItem[] = [
  { id: 'a1', channel: 'KubeVirt', workload: 'payments-vm-02', state: 'migrating', progress: 64 },
  { id: 'a2', channel: 'Incus', workload: 'fraud-lxc-01', state: 'migrating', progress: 41 },
  { id: 'a3', channel: 'Docker', workload: 'registry-cache', state: 'syncing', progress: 22 },
  { id: 'a4', channel: 'CRI-O', workload: 'argo-runner-bd2', state: 'snapshot', progress: 88 },
  { id: 'a5', channel: 'KubeVirt', workload: 'analytics-vm', state: 'running', progress: 100 },
  { id: 'a6', channel: 'Incus', workload: 'security-sandbox', state: 'building', progress: 56 },
  { id: 'a7', channel: 'GitOps', workload: 'platform/observability', state: 'syncing', progress: 78 },
];

export function ActivityTimeline({ items = DEFAULT_ACTIVITY }: { items?: ActivityItem[] }) {
  return (
    <ul className="activity-timeline">
      {items.map((item) => (
        <li key={item.id} className={`activity-row state-${item.state}`}>
          <span className="activity-channel">{item.channel}</span>
          <span className="activity-workload">{item.workload}</span>
          <div className="activity-bar">
            <i style={{ width: `${item.progress}%` }} />
            <span className="activity-shimmer" />
          </div>
          <b className="activity-state">{item.state}</b>
          <em>{item.progress}%</em>
        </li>
      ))}
    </ul>
  );
}

/* -------------------- Original StatGrid -------------------- */

export function StatGrid({ items, columns = 4 }: { items: StatGridItem[]; columns?: number }) {
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item) => {
        const deltaCls = item.delta === undefined || item.delta === 0 ? '' : item.delta > 0 ? 'delta-up' : 'delta-down';
        return (
          <div key={item.label} className={`stat-grid-item status-${item.status ?? 'neutral'} ${deltaCls}`}>
            <span>{item.label}</span>
            <strong>{item.value}{item.unit && <em>{item.unit}</em>}</strong>
            {item.hint && <small>{item.hint}</small>}
            {item.delta !== undefined && item.delta !== 0 && (
              <i className="stat-delta">{item.delta > 0 ? '▲' : '▼'} {Math.abs(item.delta).toFixed(1)}</i>
            )}
          </div>
        );
      })}
    </div>
  );
}

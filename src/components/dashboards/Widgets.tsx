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

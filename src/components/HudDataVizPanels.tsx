import { useMemo, type CSSProperties } from 'react';
import {
  buildActivityHeatmap,
  buildChord,
  buildGeoEdgeMap,
  buildGpuThermals,
  buildHexFabric,
  buildLatencyViolins,
  buildSankey,
  buildStorageTreemap,
  buildTimeline,
  type SankeyLink,
} from '../lib/hudDataViz';
import type { EnvironmentSnapshot } from '../lib/liveTelemetry';

const geo = buildGeoEdgeMap();
const sankey = buildSankey();
const chord = buildChord();
const heatmap = buildActivityHeatmap();
const gpus = buildGpuThermals();
const violins = buildLatencyViolins();
const treemap = buildStorageTreemap();
const hex = buildHexFabric(6, 11);
const timeline = buildTimeline();

interface CommonProps {
  telemetry?: EnvironmentSnapshot;
}

/* ============================================================================
   1. GeoEdgeMap — animated world map with arcs and pulse markers
   ============================================================================ */

function nodeColor(role: string): string {
  switch (role) {
    case 'control': return '#33f7ff';
    case 'edge':    return '#a4f9ff';
    case 'storage': return '#75ff6a';
    case 'gpu':     return '#ff4af7';
    default:        return '#ffffff';
  }
}

function arcPath(ax: number, ay: number, bx: number, by: number, bend = 0.25): string {
  const dx = bx - ax;
  const dy = by - ay;
  const mx = ax + dx / 2 + dy * -bend;
  const my = ay + dy / 2 + dx * bend;
  return `M${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

export function GeoEdgeMapPanel({ telemetry }: CommonProps) {
  const totalMbps = useMemo(
    () => geo.arcs.reduce((sum, arc) => sum + arc.mbps, 0),
    [],
  );
  const livePulse = telemetry ? (telemetry.tick % 60) / 60 : 0.5;

  return (
    <article className="hud-panel hud-geo">
      <div className="hud-panel-title">
        <span>Global edge fabric</span>
        <strong>{geo.nodes.length} sites · {(totalMbps / 1000).toFixed(1)} Gbps</strong>
      </div>
      <svg className="hud-geo-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="geo-arc-grad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0" />
            <stop offset="30%" stopColor="var(--theme-accent)" stopOpacity="0.9" />
            <stop offset="70%" stopColor="var(--theme-accent-2)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="geo-blob" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Latitude / longitude grid */}
        <g className="hud-geo-grid">
          {[20, 40, 60, 80].map((y) => (
            <line key={`lat-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
          {[15, 30, 45, 60, 75, 90].map((x) => (
            <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="100" />
          ))}
        </g>

        {/* Stylised continent blobs */}
        <g className="hud-geo-continents" opacity="0.45">
          <path d="M5,28 Q15,16 30,22 Q40,30 32,46 Q22,52 12,46 Q4,40 5,28 Z" />
          <path d="M40,22 Q55,14 64,22 Q70,28 60,38 Q50,42 42,36 Q38,30 40,22 Z" />
          <path d="M62,40 Q78,32 88,42 Q92,52 84,60 Q72,64 64,56 Q60,50 62,40 Z" />
          <path d="M30,62 Q44,58 46,72 Q44,82 34,82 Q26,78 28,68 Z" />
          <path d="M50,68 Q60,64 64,76 Q60,86 52,84 Q46,78 50,68 Z" />
          <path d="M82,72 Q92,70 94,82 Q88,88 80,84 Q78,78 82,72 Z" />
        </g>

        {/* Pulse glow under nodes */}
        {geo.nodes.map((n) => (
          <circle key={`glow-${n.id}`} cx={n.x} cy={n.y} r="5" fill="url(#geo-blob)" />
        ))}

        {/* Arcs */}
        {geo.arcs.map((arc) => {
          const a = geo.nodes.find((n) => n.id === arc.from)!;
          const b = geo.nodes.find((n) => n.id === arc.to)!;
          const d = arcPath(a.x, a.y, b.x, b.y, 0.22);
          return (
            <g key={`${arc.from}-${arc.to}`}>
              <path d={d} className="hud-geo-arc" strokeOpacity={0.25 + arc.intensity / 200} />
              <path d={d} className="hud-geo-arc-glow" stroke="url(#geo-arc-grad)" />
              <circle r="0.9" className="hud-geo-traveller" style={{ animationDelay: `${arc.delay}s` } as CSSProperties}>
                <animateMotion dur={`${6 + (100 - arc.intensity) / 12}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}

        {/* Nodes */}
        {geo.nodes.map((n) => (
          <g key={n.id} className={`hud-geo-node role-${n.role}`} transform={`translate(${n.x} ${n.y})`}>
            <circle r="3.2" className="hud-geo-node-ring" />
            <circle r="1.6" fill={nodeColor(n.role)} />
            <text x="4" y="-2" className="hud-geo-node-label">{n.region}</text>
            <text x="4" y="2.4" className="hud-geo-node-sub">{n.workloads}wl · {n.rttMs}ms</text>
          </g>
        ))}

        {/* Sweep line */}
        <line
          x1={livePulse * 100} y1="0" x2={livePulse * 100} y2="100"
          className="hud-geo-sweep"
        />
      </svg>
      <div className="hud-geo-legend">
        <span><i style={{ background: nodeColor('control') }} /> control</span>
        <span><i style={{ background: nodeColor('edge') }} /> edge</span>
        <span><i style={{ background: nodeColor('storage') }} /> storage</span>
        <span><i style={{ background: nodeColor('gpu') }} /> gpu</span>
      </div>
    </article>
  );
}

/* ============================================================================
   2. SankeyFlowPanel — workload → cache → storage flows
   ============================================================================ */

function sankeyNodeAt(id: string): { x: number; y: number } {
  const node = sankey.nodes.find((n) => n.id === id)!;
  const x = 10 + node.column * 38;
  const y = 8 + node.row * 78;
  return { x, y };
}

function sankeyPath(link: SankeyLink): string {
  const a = sankeyNodeAt(link.source);
  const b = sankeyNodeAt(link.target);
  const cx1 = a.x + (b.x - a.x) * 0.5;
  const cx2 = b.x - (b.x - a.x) * 0.5;
  return `M${a.x + 4} ${a.y} C ${cx1} ${a.y}, ${cx2} ${b.y}, ${b.x - 4} ${b.y}`;
}

export function SankeyFlowPanel({ telemetry }: CommonProps) {
  const totalFlow = useMemo(() => sankey.links.reduce((s, l) => s + l.value, 0), []);
  const liveScale = telemetry ? 0.85 + ((telemetry.tick % 12) / 12) * 0.3 : 1;

  return (
    <article className="hud-panel hud-sankey">
      <div className="hud-panel-title">
        <span>Workload &rarr; storage flow</span>
        <strong>{Math.round(totalFlow * liveScale).toLocaleString()} MB/s aggregate</strong>
      </div>
      <svg className="hud-sankey-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {sankey.links.map((l, i) => (
            <linearGradient key={`sg-${i}`} id={`sg-${i}`} x1="0%" x2="100%">
              <stop offset="0%" stopColor={`hsl(${l.hue} 95% 60% / 0.9)`} />
              <stop offset="100%" stopColor={`hsl(${l.hue + 30} 95% 60% / 0.4)`} />
            </linearGradient>
          ))}
        </defs>

        {/* Links */}
        {sankey.links.map((l, i) => (
          <path
            key={`l-${i}`}
            d={sankeyPath(l)}
            stroke={`url(#sg-${i})`}
            strokeWidth={Math.max(1.5, l.value / 50)}
            fill="none"
            className="hud-sankey-link"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}

        {/* Nodes */}
        {sankey.nodes.map((n) => {
          const { x, y } = sankeyNodeAt(n.id);
          return (
            <g key={n.id} className={`hud-sankey-node node-${n.category}`} transform={`translate(${x} ${y})`}>
              <rect x="-3.6" y="-3.2" width="7.2" height="6.4" rx="1.4" />
              <text x="0" y="0.6" className="hud-sankey-node-label">{n.label}</text>
            </g>
          );
        })}

        {/* Column labels */}
        {['Workloads', 'Cache plane', 'Storage / fabric'].map((label, i) => (
          <text key={label} x={10 + i * 38} y="98" className="hud-sankey-col">
            {label.toUpperCase()}
          </text>
        ))}
      </svg>
    </article>
  );
}

/* ============================================================================
   3. ChordMatrixPanel — service mesh connections
   ============================================================================ */

export function ChordMatrixPanel(_props: CommonProps) {
  const cx = 50, cy = 50, R = 38;
  const positions = chord.nodes.map((n, i) => {
    const angle = (i / chord.nodes.length) * Math.PI * 2 - Math.PI / 2;
    return {
      id: n.id,
      x: cx + Math.cos(angle) * R,
      y: cy + Math.sin(angle) * R,
      angle,
      color: n.color,
      label: n.label,
    };
  });
  const lookup = new Map(positions.map((p) => [p.id, p]));

  return (
    <article className="hud-panel hud-chord">
      <div className="hud-panel-title">
        <span>Service mesh chord</span>
        <strong>{chord.nodes.length} services · {chord.edges.length} links</strong>
      </div>
      <svg className="hud-chord-canvas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="chord-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.18" />
            <stop offset="60%" stopColor="var(--theme-accent)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R + 4} fill="url(#chord-bg)" />
        <circle cx={cx} cy={cy} r={R} className="hud-chord-ring" />

        {/* Tick marks */}
        {positions.map((p) => (
          <g key={`tick-${p.id}`} transform={`rotate(${(p.angle * 180) / Math.PI + 90} ${cx} ${cy})`}>
            <line x1={cx} y1={cy - R - 1} x2={cx} y2={cy - R + 2} className="hud-chord-tick" />
          </g>
        ))}

        {/* Edges */}
        {chord.edges.map((e, i) => {
          const a = lookup.get(e.source)!;
          const b = lookup.get(e.target)!;
          const d = `M${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
          const width = 0.4 + (e.value / 100) * 1.6;
          return (
            <path
              key={`ce-${i}`}
              d={d}
              className="hud-chord-edge"
              stroke={a.color}
              strokeWidth={width}
              style={{ animationDelay: `${i * 90}ms` }}
            />
          );
        })}

        {/* Nodes */}
        {positions.map((p, i) => (
          <g key={`cn-${p.id}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r="2.2" fill={p.color} className="hud-chord-node" style={{ animationDelay: `${i * 70}ms` }} />
            <text
              x={Math.cos(p.angle) * 4}
              y={Math.sin(p.angle) * 4 + 0.6}
              textAnchor={Math.cos(p.angle) > 0.2 ? 'start' : Math.cos(p.angle) < -0.2 ? 'end' : 'middle'}
              className="hud-chord-label"
              fill={p.color}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </article>
  );
}

/* ============================================================================
   4. ActivityHeatmapPanel — 7 day × 24 hour calendar
   ============================================================================ */

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

function heatColor(v: number): string {
  // Multi-stop gradient: blue → cyan → green → amber → magenta
  const stops: Array<[number, string]> = [
    [0,    'rgba(7,14,28,0.6)'],
    [0.2,  'rgba(33,122,200,0.7)'],
    [0.45, 'rgba(51,247,255,0.8)'],
    [0.65, 'rgba(108,255,138,0.85)'],
    [0.82, 'rgba(255,209,102,0.9)'],
    [1,    'rgba(255,74,247,0.95)'],
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [s1, c1] = stops[i];
    const [s2, c2] = stops[i + 1];
    if (v <= s2) {
      const t = (v - s1) / (s2 - s1);
      return mixRgba(c1, c2, t);
    }
  }
  return stops[stops.length - 1][1];
}

function mixRgba(a: string, b: string, t: number): string {
  const pa = a.match(/[\d.]+/g)!.map(Number);
  const pb = b.match(/[\d.]+/g)!.map(Number);
  const out = pa.map((v, i) => v + (pb[i] - v) * t);
  return `rgba(${Math.round(out[0])}, ${Math.round(out[1])}, ${Math.round(out[2])}, ${(out[3] ?? 1).toFixed(2)})`;
}

export function ActivityHeatmapPanel({ telemetry }: CommonProps) {
  const pulseIdx = telemetry ? telemetry.tick % (heatmap.dayLabels.length * 24) : 0;

  return (
    <article className="hud-panel hud-heatmap">
      <div className="hud-panel-title">
        <span>Cluster activity · 7d × 24h</span>
        <strong>tick {telemetry?.tick ?? 0}</strong>
      </div>
      <div className="hud-heatmap-grid">
        <div className="hud-heatmap-corner" />
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={`h-${h}`} className="hud-heatmap-hour">{HOURS.includes(h) ? `${h}h` : ''}</div>
        ))}
        {heatmap.dayLabels.map((day, dIdx) => (
          <>
            <div key={`d-${day}`} className="hud-heatmap-day">{day}</div>
            {Array.from({ length: 24 }).map((_, h) => {
              const cell = heatmap.cells[dIdx * 24 + h];
              const pulsing = (dIdx * 24 + h) === pulseIdx;
              return (
                <div
                  key={`c-${dIdx}-${h}`}
                  className={`hud-heatmap-cell ${pulsing ? 'is-pulse' : ''}`}
                  style={{ background: heatColor(cell.intensity) } as CSSProperties}
                  title={`${day} ${h}:00 — ${(cell.intensity * 100).toFixed(0)}%`}
                />
              );
            })}
          </>
        ))}
      </div>
      <div className="hud-heatmap-scale" aria-hidden="true">
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <span key={v} style={{ background: heatColor(v) }} />
        ))}
        <em>idle</em>
        <em className="end">peak</em>
      </div>
    </article>
  );
}

/* ============================================================================
   5. GpuThermalPanel — per-GPU temperature, util, sparkline
   ============================================================================ */

function gpuSparkPoints(values: number[]): string {
  return values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${100 - v}`)
    .join(' ');
}

export function GpuThermalPanel({ telemetry }: CommonProps) {
  const liveBoost = telemetry ? telemetry.cpuPercent / 100 : 0;

  return (
    <article className="hud-panel hud-gpu">
      <div className="hud-panel-title">
        <span>GPU thermals · {gpus.length} accelerators</span>
        <strong>{gpus.reduce((s, g) => s + g.powerW, 0)} W draw</strong>
      </div>
      <div className="hud-gpu-grid">
        {gpus.map((gpu) => {
          const tempBoost = Math.round(liveBoost * 4);
          const temp = gpu.tempC + tempBoost;
          const util = Math.min(100, gpu.utilization + Math.round(liveBoost * 5));
          return (
            <div key={gpu.id} className={`hud-gpu-card status-${gpu.status}`}>
              <div className="hud-gpu-head">
                <strong>{gpu.id.toUpperCase()}</strong>
                <span>{gpu.model}</span>
                <em>{temp}°C</em>
              </div>
              <div className="hud-gpu-meters">
                <div className="hud-gpu-meter">
                  <span>util</span>
                  <i><b style={{ width: `${util}%` }} /></i>
                  <strong>{util}%</strong>
                </div>
                <div className="hud-gpu-meter">
                  <span>pwr</span>
                  <i><b style={{ width: `${(gpu.powerW / 720) * 100}%` }} /></i>
                  <strong>{gpu.powerW}W</strong>
                </div>
              </div>
              <svg className="hud-gpu-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={gpuSparkPoints(gpu.series)} className="hud-gpu-spark-line" />
                <polygon
                  points={`${gpuSparkPoints(gpu.series)} 100,100 0,100`}
                  className="hud-gpu-spark-fill"
                />
              </svg>
            </div>
          );
        })}
      </div>
    </article>
  );
}

/* ============================================================================
   6. LatencyViolinPanel — per-service violin/percentile spreads
   ============================================================================ */

export function LatencyViolinPanel(_props: CommonProps) {
  return (
    <article className="hud-panel hud-violin">
      <div className="hud-panel-title">
        <span>Per-service latency spread</span>
        <strong>p50 · p95 · p99</strong>
      </div>
      <div className="hud-violin-grid">
        {violins.map((v, i) => {
          const w = 100;
          const h = 40;
          const top = v.samples.map((s, idx) => {
            const x = (idx / (v.samples.length - 1)) * w;
            const y = h / 2 - (s * h * 0.5);
            return `${x},${y}`;
          }).join(' ');
          const bot = v.samples.map((s, idx) => {
            const x = (idx / (v.samples.length - 1)) * w;
            const y = h / 2 + (s * h * 0.5);
            return `${x},${y}`;
          }).reverse().join(' ');
          return (
            <div key={v.service} className="hud-violin-row" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="hud-violin-label">
                <strong>{v.service}</strong>
                <em>{v.unitMs}ms scale</em>
              </div>
              <svg className="hud-violin-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={`v-${i}`} x1="0%" x2="100%">
                    <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.05" />
                    <stop offset="50%" stopColor="var(--theme-accent)" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="var(--theme-warn)" stopOpacity="0.95" />
                  </linearGradient>
                </defs>
                <polygon points={`${top} ${bot}`} fill={`url(#v-${i})`} />
                {/* Percentile markers */}
                <line x1={(v.p50 / v.unitMs) * w} y1="0" x2={(v.p50 / v.unitMs) * w} y2={h} className="hud-violin-marker p50" />
                <line x1={(v.p95 / v.unitMs) * w} y1="0" x2={(v.p95 / v.unitMs) * w} y2={h} className="hud-violin-marker p95" />
                <line x1={(v.p99 / v.unitMs) * w} y1="0" x2={(v.p99 / v.unitMs) * w} y2={h} className="hud-violin-marker p99" />
              </svg>
              <div className="hud-violin-readout">
                <span><b>p50</b>{v.p50}</span>
                <span><b>p95</b>{v.p95}</span>
                <span><b>p99</b>{v.p99}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

/* ============================================================================
   7. StorageTreemapPanel — capacity treemap with hot/warm/cold tiers
   ============================================================================ */

function squarify(rects: typeof treemap, width = 100, height = 60): Array<{ x: number; y: number; w: number; h: number; t: typeof treemap[0] }> {
  // Simple slice-and-dice fallback that respects relative weights.
  const total = rects.reduce((s, r) => s + r.value, 0);
  const out: Array<{ x: number; y: number; w: number; h: number; t: typeof treemap[0] }> = [];
  let x = 0;
  let rowH = 0;
  let y = 0;
  let rowItems: Array<{ t: typeof treemap[0]; w: number }> = [];

  rects.forEach((r) => {
    const area = (r.value / total) * width * height;
    const targetH = Math.max(8, Math.sqrt(area * 0.9));
    const w = area / targetH;
    if (x + w > width + 0.001 && rowItems.length > 0) {
      // Flush current row
      let cursorX = 0;
      rowItems.forEach((ri) => {
        out.push({ x: cursorX, y, w: ri.w, h: rowH, t: ri.t });
        cursorX += ri.w;
      });
      y += rowH;
      x = 0;
      rowH = 0;
      rowItems = [];
    }
    rowItems.push({ t: r, w });
    x += w;
    rowH = Math.max(rowH, targetH);
  });
  if (rowItems.length > 0) {
    let cursorX = 0;
    const remaining = height - y;
    rowItems.forEach((ri) => {
      out.push({ x: cursorX, y, w: ri.w, h: remaining > 0 ? remaining : rowH, t: ri.t });
      cursorX += ri.w;
    });
  }
  return out;
}

export function StorageTreemapPanel(_props: CommonProps) {
  const rects = useMemo(() => squarify(treemap, 100, 60), []);
  return (
    <article className="hud-panel hud-treemap">
      <div className="hud-panel-title">
        <span>Capacity allocation map</span>
        <strong>{treemap.reduce((s, r) => s + r.value, 0)} TiB</strong>
      </div>
      <svg className="hud-treemap-canvas" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        {rects.map((r, i) => (
          <g key={`tm-${r.t.id}-${i}`} className={`hud-treemap-tile tier-${r.t.category}`}>
            <rect
              x={r.x + 0.4}
              y={r.y + 0.4}
              width={Math.max(1, r.w - 0.8)}
              height={Math.max(1, r.h - 0.8)}
              fill={`hsl(${r.t.hue} 85% 55% / 0.85)`}
              stroke={`hsl(${r.t.hue} 95% 70%)`}
              strokeWidth="0.3"
              style={{ animationDelay: `${i * 60}ms` } as CSSProperties}
            />
            {r.w > 12 && r.h > 8 && (
              <>
                <text x={r.x + 1.5} y={r.y + 4} className="hud-treemap-label">{r.t.label}</text>
                <text x={r.x + 1.5} y={r.y + r.h - 1.5} className="hud-treemap-value">{r.t.value} TiB</text>
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="hud-treemap-legend">
        <span className="tier-hot">hot</span>
        <span className="tier-warm">warm</span>
        <span className="tier-cold">cold</span>
        <span className="tier-archive">archive</span>
      </div>
    </article>
  );
}

/* ============================================================================
   8. HexFabricPanel — animated hex grid representing fabric nodes
   ============================================================================ */

function hexPolygon(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const ang = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`);
  }
  return pts.join(' ');
}

export function HexFabricPanel({ telemetry }: CommonProps) {
  const r = 4;
  const w = 100;
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  const activeIdx = telemetry ? telemetry.tick % hex.length : -1;

  return (
    <article className="hud-panel hud-hexfabric">
      <div className="hud-panel-title">
        <span>Compute fabric · hex topology</span>
        <strong>{hex.length} cells</strong>
      </div>
      <svg className="hud-hex-canvas" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {hex.map((cell, idx) => {
          const cx = 6 + cell.q * dx + (cell.r % 2 === 1 ? dx / 2 : 0);
          const cy = 8 + cell.r * dy;
          if (cx > w - 4) return null;
          const pulse = idx === activeIdx ? ' is-pulse' : '';
          return (
            <g key={`h-${cell.q}-${cell.r}`} className={`hud-hex-cell status-${cell.status}${pulse}`}>
              <polygon points={hexPolygon(cx, cy, r * 0.9)} />
              <text x={cx} y={cy + 1.2} textAnchor="middle" className="hud-hex-load">{cell.load}</text>
            </g>
          );
        })}
      </svg>
      <div className="hud-hex-legend">
        <span className="status-idle">idle</span>
        <span className="status-syncing">sync</span>
        <span className="status-active">active</span>
        <span className="status-hot">hot</span>
        <span className="status-fault">fault</span>
      </div>
    </article>
  );
}

/* ============================================================================
   9. TimelinePanel — multi-track gantt / event timeline
   ============================================================================ */

export function TimelinePanel({ telemetry }: CommonProps) {
  const playhead = telemetry ? telemetry.tick % 100 : 50;
  return (
    <article className="hud-panel hud-timeline">
      <div className="hud-panel-title">
        <span>Pipeline timeline · 24h window</span>
        <strong>{timeline.length} tracks</strong>
      </div>
      <div className="hud-timeline-axis">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`ax-${i}`}>{i * 3}h</span>
        ))}
      </div>
      <div className="hud-timeline-tracks">
        {timeline.map((track) => (
          <div key={track.id} className={`hud-timeline-track cat-${track.category}`}>
            <div className="hud-timeline-label">
              <strong>{track.label}</strong>
              <em>{track.category}</em>
            </div>
            <div className="hud-timeline-row">
              {track.segments.map((seg, i) => (
                <span
                  key={`${track.id}-s-${i}`}
                  className={`hud-timeline-seg s-${seg.status}`}
                  style={{ left: `${seg.start}%`, width: `${seg.end - seg.start}%`, animationDelay: `${i * 120}ms` } as CSSProperties}
                >
                  <b>{seg.tag}</b>
                </span>
              ))}
              <span className="hud-timeline-playhead" style={{ left: `${playhead}%` } as CSSProperties} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ============================================================================
   Combined section that the HudDashboard mounts
   ============================================================================ */

export function HudDataVizSection({ telemetry }: { telemetry?: EnvironmentSnapshot }) {
  return (
    <section className="hud-dataviz-section" aria-label="Complex data visualizations">
      <header className="hud-dataviz-header">
        <span className="hud-kicker">VIZ // DENSITY</span>
        <h2>Complex telemetry surfaces</h2>
        <p>
          Live geo edge fabric, Sankey flow, service-mesh chord, activity heatmap, accelerator thermals,
          per-service latency violins, capacity treemap, hex compute fabric, and a multi-track pipeline timeline.
        </p>
      </header>

      <div className="hud-dataviz-grid">
        <GeoEdgeMapPanel telemetry={telemetry} />
        <SankeyFlowPanel telemetry={telemetry} />
        <ChordMatrixPanel telemetry={telemetry} />
        <ActivityHeatmapPanel telemetry={telemetry} />
        <GpuThermalPanel telemetry={telemetry} />
        <LatencyViolinPanel telemetry={telemetry} />
        <StorageTreemapPanel telemetry={telemetry} />
        <HexFabricPanel telemetry={telemetry} />
        <TimelinePanel telemetry={telemetry} />
      </div>
    </section>
  );
}

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';

/* ============================================================
   Advanced data-visualization widgets used in the redesigned
   HUD and across dashboards: heatmaps, chord diagrams, sankey
   flows, geo maps, treemaps, radial bar charts, flame graphs,
   stream graphs, and scatter plots.

   Every widget is purely SVG / CSS driven, picks its colors
   from --theme-* CSS variables, and accepts a `tick` prop so
   that visuals can be retimed by callers when desired.
   ============================================================ */

/* -------------------- Heatmap matrix --------------------
   Renders an N×M grid where each cell is colored by its
   intensity (0-1). Includes row + column axis labels and a
   legend strip; useful for showing latency-by-node or
   IOPS-by-disk style breakdowns. */

interface HeatmapMatrixProps {
  rows: string[];
  cols: string[];
  /** rows[i] × cols[j], values 0..1 */
  cells: number[][];
  unit?: string;
  /** Maps a 0..1 value to a label, e.g. (v) => `${(v*200).toFixed(0)}µs`. */
  format?: (value: number) => string;
}

export function HeatmapMatrix({ rows, cols, cells, unit = '', format }: HeatmapMatrixProps) {
  return (
    <div className="heatmap-matrix">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `8.5rem repeat(${cols.length}, 1fr)` }}>
        <span className="heatmap-corner" />
        {cols.map((col) => (
          <span key={col} className="heatmap-col-label">{col}</span>
        ))}
        {rows.map((row, rowIdx) => (
          <Fragment key={row}>
            <span className="heatmap-row-label">{row}</span>
            {cells[rowIdx]?.map((value, colIdx) => {
              const clamped = Math.max(0, Math.min(1, value));
              const stop = clamped < 0.33 ? 'good' : clamped < 0.66 ? 'warn' : 'danger';
              const display = format ? format(clamped) : `${Math.round(clamped * 100)}${unit}`;
              return (
                <span
                  key={`${row}-${cols[colIdx]}`}
                  className={`heatmap-cell intensity-${stop}`}
                  style={{
                    '--intensity': clamped,
                    animationDelay: `${(rowIdx + colIdx) * 35}ms`,
                  } as CSSProperties}
                  title={`${row} · ${cols[colIdx]} → ${display}`}
                >
                  <b>{display}</b>
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>cool</span>
        <i />
        <span>hot</span>
      </div>
    </div>
  );
}

/* -------------------- Chord diagram --------------------
   Circular layout of N groups with thick "ribbons" showing
   bidirectional traffic between them. Used here for
   service-to-service traffic or VLAN-to-VLAN policy flow. */

interface ChordGroup {
  label: string;
  color?: string;
}

interface ChordLink {
  source: number;
  target: number;
  /** Relative weight; the renderer normalizes itself. */
  value: number;
}

interface ChordDiagramProps {
  groups: ChordGroup[];
  links: ChordLink[];
  size?: number;
  tick?: number;
}

export function ChordDiagram({ groups, links, size = 280, tick = 0 }: ChordDiagramProps) {
  const cx = 50;
  const cy = 50;
  const r = 38;
  const innerR = 30;
  const n = groups.length;
  const segAngle = (Math.PI * 2) / n;
  const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-danger)'];

  const groupAngles = useMemo(() => {
    return groups.map((_, idx) => {
      const start = idx * segAngle - Math.PI / 2;
      const end = start + segAngle;
      return { start, end, mid: (start + end) / 2 };
    });
  }, [groups, segAngle]);

  const linkPaths = useMemo(() => {
    return links.map((link, idx) => {
      const a = groupAngles[link.source];
      const b = groupAngles[link.target];
      if (!a || !b) return null;
      const sa = a.start + segAngle * 0.18 + ((idx * 0.07) % (segAngle * 0.6));
      const sb = b.start + segAngle * 0.18 + ((idx * 0.13) % (segAngle * 0.6));
      const ax = cx + Math.cos(sa) * innerR;
      const ay = cy + Math.sin(sa) * innerR;
      const bx = cx + Math.cos(sb) * innerR;
      const by = cy + Math.sin(sb) * innerR;
      const path = `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
      return { path, color: palette[link.source % palette.length], weight: link.value };
    });
  }, [links, groupAngles, segAngle, palette]);

  const maxWeight = Math.max(1, ...links.map((l) => l.value));

  return (
    <div className="chord-diagram" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="chord-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="46" fill="url(#chord-bg)" />
        {linkPaths.map((link, idx) => {
          if (!link) return null;
          const thickness = 0.4 + (link.weight / maxWeight) * 1.6;
          return (
            <g key={`chord-link-${idx}`}>
              <path d={link.path} stroke={link.color} strokeWidth={thickness} fill="none" opacity="0.18" style={{ filter: 'blur(1.6px)' }} />
              <path
                d={link.path}
                stroke={link.color}
                strokeWidth={thickness}
                fill="none"
                opacity="0.78"
                style={{ filter: `drop-shadow(0 0 1.6px ${link.color})` }}
              />
              <circle r="0.7" fill={link.color}>
                <animateMotion dur={`${4 + (idx % 5)}s`} repeatCount="indefinite" path={link.path} begin={`${(idx * 0.4) % 3}s`} />
              </circle>
            </g>
          );
        })}
        {groupAngles.map((angles, idx) => {
          const color = groups[idx].color ?? palette[idx % palette.length];
          const x1 = cx + Math.cos(angles.start) * r;
          const y1 = cy + Math.sin(angles.start) * r;
          const x2 = cx + Math.cos(angles.end) * r;
          const y2 = cy + Math.sin(angles.end) * r;
          const largeArc = segAngle > Math.PI ? 1 : 0;
          const lx = cx + Math.cos(angles.mid) * (r + 6);
          const ly = cy + Math.sin(angles.mid) * (r + 6);
          return (
            <g key={`chord-grp-${idx}`}>
              <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} stroke={color} strokeWidth="2.8" fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
              <text x={lx} y={ly} className="chord-label" textAnchor={Math.cos(angles.mid) > 0.1 ? 'start' : Math.cos(angles.mid) < -0.1 ? 'end' : 'middle'} dominantBaseline="central">
                {groups[idx].label}
              </text>
            </g>
          );
        })}
        {/* sweep beam */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos((tick / 12) * Math.PI * 2 - Math.PI / 2) * 36}
          y2={cy + Math.sin((tick / 12) * Math.PI * 2 - Math.PI / 2) * 36}
          stroke="var(--theme-accent)"
          strokeWidth="0.4"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

/* -------------------- Sankey flow --------------------
   Multi-stage left-to-right flow visualisation. Each "stage"
   is a column of bands sized proportionally to its share of
   throughput; bands flow into the next stage via curved
   ribbons of matching width. */

export interface SankeyStage {
  label: string;
  bands: { id: string; label: string; value: number; color?: string }[];
}

export interface SankeyFlowLink {
  from: string;
  to: string;
  value: number;
}

interface SankeyFlowProps {
  stages: SankeyStage[];
  links: SankeyFlowLink[];
  height?: number;
}

export function SankeyFlow({ stages, links, height = 220 }: SankeyFlowProps) {
  const width = 480;
  const stageCount = stages.length;
  const colWidth = 14;
  const gutter = (width - colWidth * stageCount) / (stageCount - 1);

  /* compute band positions */
  const bandPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; height: number; color: string }>();
    stages.forEach((stage, stageIdx) => {
      const x = stageIdx * (colWidth + gutter);
      const total = stage.bands.reduce((acc, b) => acc + b.value, 0);
      let cursor = 0;
      stage.bands.forEach((band, bandIdx) => {
        const bandHeight = (band.value / total) * 100;
        const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-danger)'];
        map.set(band.id, {
          x,
          y: cursor,
          height: bandHeight,
          color: band.color ?? palette[bandIdx % palette.length],
        });
        cursor += bandHeight + 1.5;
      });
    });
    return map;
  }, [stages, gutter]);

  return (
    <div className="sankey-flow" style={{ height }}>
      <svg viewBox={`0 0 ${width} 110`} preserveAspectRatio="none">
        <defs>
          {Array.from(bandPositions.entries()).map(([id, band]) => (
            <linearGradient key={`sk-grad-${id}`} id={`sk-grad-${id}`} x1="0%" x2="100%">
              <stop offset="0%" stopColor={band.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={band.color} stopOpacity="0.2" />
            </linearGradient>
          ))}
        </defs>
        {/* links: drawn first so they sit behind bands */}
        {links.map((link, idx) => {
          const a = bandPositions.get(link.from);
          const b = bandPositions.get(link.to);
          if (!a || !b) return null;
          const aLinkHeight = (link.value / Math.max(1, sumOut(links, link.from))) * a.height;
          const bLinkHeight = (link.value / Math.max(1, sumIn(links, link.to))) * b.height;
          const ax = a.x + colWidth;
          const ay = a.y;
          const bx = b.x;
          const by = b.y;
          const midX = (ax + bx) / 2;
          const path =
            `M ${ax} ${ay} ` +
            `C ${midX} ${ay} ${midX} ${by} ${bx} ${by} ` +
            `L ${bx} ${by + bLinkHeight} ` +
            `C ${midX} ${by + bLinkHeight} ${midX} ${ay + aLinkHeight} ${ax} ${ay + aLinkHeight} Z`;
          return (
            <path
              key={`sk-link-${idx}`}
              d={path}
              fill={`url(#sk-grad-${link.from})`}
              opacity="0.55"
              className="sankey-link"
            >
              <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3.5s" repeatCount="indefinite" begin={`${idx * 0.2}s`} />
            </path>
          );
        })}
        {/* bands */}
        {stages.map((stage, stageIdx) =>
          stage.bands.map((band) => {
            const pos = bandPositions.get(band.id);
            if (!pos) return null;
            return (
              <g key={band.id} className="sankey-band">
                <rect x={pos.x} y={pos.y} width={colWidth} height={pos.height} fill={pos.color} rx="1.2" style={{ filter: `drop-shadow(0 0 1.5px ${pos.color})` }} />
                <text x={pos.x + colWidth / 2} y={pos.y + pos.height / 2} className="sankey-band-label" textAnchor="middle" dominantBaseline="central">
                  {band.value.toFixed(0)}
                </text>
                {/* stage label only once per stage */}
                {band === stage.bands[0] && (
                  <text x={pos.x + colWidth / 2} y={108} className="sankey-stage-label" textAnchor="middle">
                    {stage.label}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {/* band side labels */}
        {Array.from(bandPositions.entries()).map(([id, pos]) => {
          const isLeft = pos.x < width / 2;
          const stage = stages.find((s) => s.bands.some((b) => b.id === id));
          const band = stage?.bands.find((b) => b.id === id);
          return (
            <text
              key={`sk-lab-${id}`}
              x={isLeft ? pos.x - 2 : pos.x + colWidth + 2}
              y={pos.y + pos.height / 2}
              className="sankey-side-label"
              textAnchor={isLeft ? 'end' : 'start'}
              dominantBaseline="central"
            >
              {band?.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function sumOut(links: SankeyFlowLink[], fromId: string): number {
  return links.filter((l) => l.from === fromId).reduce((a, l) => a + l.value, 0);
}

function sumIn(links: SankeyFlowLink[], toId: string): number {
  return links.filter((l) => l.to === toId).reduce((a, l) => a + l.value, 0);
}

/* -------------------- Geo node map --------------------
   Stylized world map showing data-center sites and arc
   connections between them with a travelling pulse. */

export interface GeoSite {
  id: string;
  name: string;
  x: number; // 0-100 (lon-ish)
  y: number; // 0-100 (lat-ish)
  status: 'primary' | 'edge' | 'failover' | 'degraded';
  workloads?: number;
}

export interface GeoArc {
  from: string;
  to: string;
  /** Latency in ms, used for label / color intensity */
  latency: number;
  channel?: 'mgmt' | 'storage' | 'mesh' | 'vm' | 'gitops';
}

interface GeoNodeMapProps {
  sites: GeoSite[];
  arcs: GeoArc[];
  height?: number;
  tick?: number;
}

/** A simplified continents path for backdrop. Hand-tuned for 0..100 viewbox. */
const CONTINENTS_PATH = [
  // North America
  'M 7 24 L 16 18 L 22 21 L 24 28 L 30 30 L 28 38 L 22 42 L 18 41 L 13 36 L 9 31 Z',
  // South America
  'M 26 48 L 31 52 L 30 60 L 26 72 L 22 78 L 19 70 L 22 58 Z',
  // Europe
  'M 46 22 L 52 19 L 56 24 L 52 30 L 47 30 L 44 26 Z',
  // Africa
  'M 47 32 L 56 33 L 60 42 L 56 58 L 50 60 L 46 50 L 45 42 Z',
  // Asia
  'M 56 18 L 78 15 L 84 22 L 86 30 L 82 36 L 72 38 L 64 34 L 58 28 Z',
  // Australia
  'M 78 60 L 88 58 L 90 64 L 84 70 L 78 68 Z',
].join(' ');

export function GeoNodeMap({ sites, arcs, height = 280, tick = 0 }: GeoNodeMapProps) {
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const channelColor = (channel?: GeoArc['channel']) => {
    switch (channel) {
      case 'storage': return 'var(--theme-good)';
      case 'mesh': return 'var(--theme-accent-2)';
      case 'vm': return 'var(--theme-warn)';
      case 'gitops': return 'var(--theme-accent)';
      default: return 'var(--theme-accent)';
    }
  };
  const statusColor = (status: GeoSite['status']) => {
    switch (status) {
      case 'primary': return 'var(--theme-accent)';
      case 'edge': return 'var(--theme-accent-2)';
      case 'failover': return 'var(--theme-warn)';
      case 'degraded': return 'var(--theme-danger)';
    }
  };
  return (
    <div className="geo-node-map" style={{ height }}>
      <svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="geo-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="var(--theme-grid)" strokeWidth="0.18" />
          </pattern>
          <radialGradient id="geo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="75" fill="url(#geo-glow)" />
        <rect x="0" y="0" width="100" height="75" fill="url(#geo-grid)" />
        {/* meridian lines */}
        {[15, 30, 45, 60, 75, 90].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="75" stroke="var(--theme-accent-soft)" strokeWidth="0.12" />
        ))}
        {[15, 30, 45, 60].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--theme-accent-soft)" strokeWidth="0.12" />
        ))}
        {/* continents */}
        <path d={CONTINENTS_PATH} fill="var(--theme-accent-soft)" opacity="0.32" stroke="var(--theme-accent)" strokeWidth="0.18" />
        {/* arcs */}
        {arcs.map((arc, idx) => {
          const a = siteMap.get(arc.from);
          const b = siteMap.get(arc.to);
          if (!a || !b) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const mx = a.x + dx / 2 + dy * 0.22;
          const my = a.y + dy / 2 - dx * 0.22 - dist * 0.18;
          const path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
          const color = channelColor(arc.channel);
          return (
            <g key={`arc-${idx}`} className="geo-arc">
              <path d={path} stroke={color} strokeWidth="0.5" fill="none" opacity="0.4" />
              <path d={path} stroke={color} strokeWidth="0.25" fill="none" opacity="0.95" strokeDasharray="1.4 2" style={{ filter: `drop-shadow(0 0 1.5px ${color})` }}>
                <animate attributeName="stroke-dashoffset" values="0;-8" dur={`${3 + (idx % 4)}s`} repeatCount="indefinite" />
              </path>
              <circle r="0.6" fill={color}>
                <animateMotion dur={`${4 + (idx % 5)}s`} repeatCount="indefinite" path={path} begin={`${(idx * 0.45) % 3}s`} />
              </circle>
              <text x={mx} y={my - 0.6} className="geo-arc-label" textAnchor="middle" fill={color}>{arc.latency}ms</text>
            </g>
          );
        })}
        {/* sites */}
        {sites.map((site) => {
          const color = statusColor(site.status);
          const wobble = (Math.sin((tick + site.x) / 4) + 1) * 0.6;
          return (
            <g key={site.id} className={`geo-site status-${site.status}`} transform={`translate(${site.x} ${site.y})`}>
              <circle r={2 + wobble} fill={color} opacity="0.18" />
              <circle r="1.2" fill={color} opacity="0.4" />
              <circle r="0.6" fill={color} style={{ filter: `drop-shadow(0 0 1.5px ${color})` }} />
              <text x="0" y="-2" className="geo-site-label" textAnchor="middle" fill={color}>{site.name}</text>
              {site.workloads !== undefined && (
                <text x="0" y="3" className="geo-site-meta" textAnchor="middle">{site.workloads}wl</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------- Treemap tiles --------------------
   Squarified-ish treemap. Tiles are simple horizontal rows
   sized by value share — not pixel-perfect treemap, but a
   pleasing, performant approximation that handles 6-12
   items cleanly. */

export interface TreemapItem {
  label: string;
  value: number;
  sub?: string;
  status?: 'good' | 'warn' | 'danger' | 'neutral';
}

interface TreemapTilesProps {
  items: TreemapItem[];
  height?: number;
}

export function TreemapTiles({ items, height = 220 }: TreemapTilesProps) {
  const total = items.reduce((acc, it) => acc + it.value, 0);
  /* Pack into rows of decreasing size */
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const rows: TreemapItem[][] = [];
  let currentRow: TreemapItem[] = [];
  let currentRowShare = 0;
  const targetRowShare = 0.4;
  sorted.forEach((item) => {
    const share = item.value / total;
    if (currentRowShare >= targetRowShare && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentRowShare = 0;
    }
    currentRow.push(item);
    currentRowShare += share;
  });
  if (currentRow.length) rows.push(currentRow);

  return (
    <div className="treemap-tiles" style={{ height }}>
      {rows.map((row, rowIdx) => {
        const rowSum = row.reduce((acc, it) => acc + it.value, 0);
        const rowShare = rowSum / total;
        return (
          <div key={rowIdx} className="treemap-row" style={{ flex: `${rowShare}` }}>
            {row.map((item) => {
              const itemShare = item.value / rowSum;
              return (
                <div
                  key={item.label}
                  className={`treemap-tile status-${item.status ?? 'neutral'}`}
                  style={{ flex: `${itemShare}` }}
                  title={`${item.label} · ${item.value.toLocaleString()}`}
                >
                  <strong>{item.label}</strong>
                  <b>{item.value.toLocaleString()}</b>
                  {item.sub && <small>{item.sub}</small>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Radial bar chart --------------------
   Polar bar chart: each bar is one category, anchored on a
   shared baseline circle and growing outwards based on its
   value (0-100). Includes axis rings and value labels. */

export interface RadialBar {
  label: string;
  value: number; // 0-100
  color?: string;
}

interface RadialBarChartProps {
  bars: RadialBar[];
  size?: number;
  innerLabel?: string;
  innerValue?: string;
}

export function RadialBarChart({ bars, size = 240, innerLabel, innerValue }: RadialBarChartProps) {
  const cx = 50;
  const cy = 50;
  const baseR = 14;
  const maxR = 42;
  const span = maxR - baseR;
  const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-danger)'];
  return (
    <div className="radial-bar-chart" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="rbc-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--theme-accent-soft)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--theme-accent-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="46" fill="url(#rbc-bg)" />
        {/* axis rings */}
        {[25, 50, 75, 100].map((pct) => (
          <circle key={pct} cx={cx} cy={cy} r={baseR + (pct / 100) * span} fill="none" stroke="var(--theme-accent-soft)" strokeWidth="0.18" strokeDasharray="0.7 1" />
        ))}
        {bars.map((bar, idx) => {
          const a0 = (idx / bars.length) * Math.PI * 2 - Math.PI / 2;
          const a1 = ((idx + 0.85) / bars.length) * Math.PI * 2 - Math.PI / 2;
          const valR = baseR + (Math.max(0, Math.min(100, bar.value)) / 100) * span;
          const color = bar.color ?? palette[idx % palette.length];
          const lx = cx + Math.cos((a0 + a1) / 2) * (maxR + 5);
          const ly = cy + Math.sin((a0 + a1) / 2) * (maxR + 5);
          const x1Inner = cx + Math.cos(a0) * baseR;
          const y1Inner = cy + Math.sin(a0) * baseR;
          const x2Inner = cx + Math.cos(a1) * baseR;
          const y2Inner = cy + Math.sin(a1) * baseR;
          const x1Outer = cx + Math.cos(a1) * valR;
          const y1Outer = cy + Math.sin(a1) * valR;
          const x2Outer = cx + Math.cos(a0) * valR;
          const y2Outer = cy + Math.sin(a0) * valR;
          const path = `M ${x1Inner} ${y1Inner} A ${baseR} ${baseR} 0 0 1 ${x2Inner} ${y2Inner} L ${x1Outer} ${y1Outer} A ${valR} ${valR} 0 0 0 ${x2Outer} ${y2Outer} Z`;
          return (
            <g key={bar.label} className="rbc-bar">
              <path d={path} fill={color} opacity="0.7" style={{ filter: `drop-shadow(0 0 1.5px ${color})` }} />
              <text x={lx} y={ly} className="rbc-label" textAnchor={Math.cos((a0 + a1) / 2) > 0.1 ? 'start' : Math.cos((a0 + a1) / 2) < -0.1 ? 'end' : 'middle'} dominantBaseline="central">
                {bar.label} <tspan className="rbc-value">{Math.round(bar.value)}%</tspan>
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={baseR - 1} fill="var(--theme-bg-2)" stroke="var(--theme-accent)" strokeWidth="0.4" opacity="0.85" />
        {innerValue && (
          <text x={cx} y={cy - 1} className="rbc-inner-value" textAnchor="middle" dominantBaseline="central">{innerValue}</text>
        )}
        {innerLabel && (
          <text x={cx} y={cy + 5} className="rbc-inner-label" textAnchor="middle">{innerLabel}</text>
        )}
      </svg>
    </div>
  );
}

/* -------------------- Flame graph --------------------
   Classic tracing flame graph: hierarchical, stacked bars
   where each level is the children of the level below. */

export interface FlameNode {
  name: string;
  value: number; // duration / cost
  status?: 'good' | 'warn' | 'danger' | 'neutral';
  children?: FlameNode[];
}

interface FlameGraphProps {
  root: FlameNode;
  height?: number;
}

export function FlameGraph({ root, height = 200 }: FlameGraphProps) {
  const rows: { node: FlameNode; depth: number; x: number; width: number }[] = [];
  const layout = (node: FlameNode, depth: number, x: number, totalWidth: number) => {
    rows.push({ node, depth, x, width: totalWidth });
    if (!node.children || node.children.length === 0) return;
    const childTotal = node.children.reduce((acc, c) => acc + c.value, 0);
    let cursor = x;
    node.children.forEach((child) => {
      const childWidth = (child.value / childTotal) * totalWidth;
      layout(child, depth + 1, cursor, childWidth);
      cursor += childWidth;
    });
  };
  layout(root, 0, 0, 100);
  const maxDepth = Math.max(...rows.map((r) => r.depth));
  const rowHeight = 100 / (maxDepth + 1);

  return (
    <div className="flame-graph" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {rows.map((row, idx) => {
          const y = 100 - (row.depth + 1) * rowHeight;
          const colorVar = `var(--theme-${row.node.status ?? (row.depth % 3 === 0 ? 'accent' : row.depth % 3 === 1 ? 'accent-2' : 'good')})`;
          return (
            <g key={idx} className="flame-cell">
              <rect x={row.x} y={y} width={Math.max(0.2, row.width - 0.4)} height={rowHeight - 0.5} fill={colorVar} opacity={0.55 + (row.depth % 3) * 0.12} style={{ filter: `drop-shadow(0 0 1px ${colorVar})` }} />
              {row.width > 8 && (
                <text x={row.x + 0.8} y={y + rowHeight / 2} className="flame-label" dominantBaseline="central">{row.node.name}</text>
              )}
              {row.width > 18 && (
                <text x={row.x + row.width - 0.8} y={y + rowHeight / 2} className="flame-value" textAnchor="end" dominantBaseline="central">{row.node.value}µs</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------- Stream graph --------------------
   Multi-series flowing area chart centered around the mean,
   creating a "ribbon of ribbons" feel. */

export interface StreamSeries {
  label: string;
  values: number[];
  color?: string;
}

interface StreamGraphProps {
  series: StreamSeries[];
  height?: number;
}

export function StreamGraph({ series, height = 160 }: StreamGraphProps) {
  const len = Math.max(...series.map((s) => s.values.length));
  /* per-index total */
  const totals = Array.from({ length: len }, (_, i) =>
    series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0),
  );
  const maxTotal = Math.max(...totals);
  const palette = ['var(--theme-accent)', 'var(--theme-accent-2)', 'var(--theme-good)', 'var(--theme-warn)', 'var(--theme-danger)'];
  /* Pre-compute baseline offsets so layers stack around midline. */
  const offsets: number[] = totals.map((t) => 50 - (t / maxTotal) * 50 * 0.9);

  return (
    <div className="stream-graph" style={{ height }}>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="stream-grid" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 10" fill="none" stroke="var(--theme-grid)" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="100" fill="url(#stream-grid)" opacity="0.5" />
        <line x1="0" y1="50" x2="200" y2="50" stroke="var(--theme-accent-soft)" strokeWidth="0.3" strokeDasharray="2 2" />
        {(() => {
          /* accumulate y from offset upwards */
          const cursor = [...offsets];
          return series.map((s, sIdx) => {
            const color = s.color ?? palette[sIdx % palette.length];
            const topPoints: string[] = [];
            const bottomPoints: string[] = [];
            for (let i = 0; i < len; i += 1) {
              const x = (i / (len - 1)) * 200;
              const v = s.values[i] ?? 0;
              const h = (v / maxTotal) * 90;
              bottomPoints.push(`${x},${cursor[i]}`);
              cursor[i] += h;
              topPoints.push(`${x},${cursor[i]}`);
            }
            const path = `M ${bottomPoints[0]} ${bottomPoints.slice(1).map((p) => `L ${p}`).join(' ')} ${topPoints.reverse().map((p) => `L ${p}`).join(' ')} Z`;
            return (
              <g key={s.label} className="stream-layer">
                <path d={path} fill={color} opacity="0.65" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
              </g>
            );
          });
        })()}
      </svg>
      <div className="stream-legend">
        {series.map((s, idx) => (
          <span key={s.label}>
            <i style={{ background: s.color ?? palette[idx % palette.length] }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------- Scatter plot --------------------
   Quadrant scatter with axis labels and optional callouts
   for outlier points. Useful for "latency vs throughput",
   "cost vs efficiency" style two-axis comparisons. */

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  status?: 'good' | 'warn' | 'danger' | 'neutral';
  size?: number;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xMax: number;
  yMax: number;
  height?: number;
  /** Optional reference line — drawn as dashed diagonal/horizontal. */
  threshold?: { axis: 'x' | 'y'; value: number; label: string };
}

export function ScatterPlot({ points, xLabel, yLabel, xMax, yMax, height = 240, threshold }: ScatterPlotProps) {
  return (
    <div className="scatter-plot" style={{ height }}>
      <svg viewBox="0 0 220 130" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="scatter-grid" width="20" height="13" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 13" fill="none" stroke="var(--theme-grid)" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect x="22" y="6" width="190" height="100" fill="url(#scatter-grid)" opacity="0.55" />
        {/* axis ticks */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={`yt-${pct}`}>
            <line x1="22" x2="212" y1={106 - pct} y2={106 - pct} stroke="var(--theme-accent-soft)" strokeWidth="0.25" strokeDasharray="1.4 2" />
            <text x="20" y={106 - pct + 1.5} className="scatter-tick" textAnchor="end">{Math.round((pct / 100) * yMax)}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={`xt-${pct}`}>
            <line x1={22 + (pct / 100) * 190} x2={22 + (pct / 100) * 190} y1="6" y2="106" stroke="var(--theme-accent-soft)" strokeWidth="0.25" strokeDasharray="1.4 2" />
            <text x={22 + (pct / 100) * 190} y="112" className="scatter-tick" textAnchor="middle">{Math.round((pct / 100) * xMax)}</text>
          </g>
        ))}
        {/* quadrant dividers (50/50) */}
        <line x1={22 + 95} x2={22 + 95} y1="6" y2="106" stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.5" />
        <line x1="22" x2="212" y1={56} y2={56} stroke="var(--theme-accent)" strokeWidth="0.3" opacity="0.5" />
        {/* threshold */}
        {threshold && (
          <g>
            {threshold.axis === 'y' ? (
              <line
                x1="22"
                x2="212"
                y1={106 - (threshold.value / yMax) * 100}
                y2={106 - (threshold.value / yMax) * 100}
                stroke="var(--theme-warn)"
                strokeWidth="0.5"
                strokeDasharray="3 2"
              />
            ) : (
              <line
                x1={22 + (threshold.value / xMax) * 190}
                x2={22 + (threshold.value / xMax) * 190}
                y1="6"
                y2="106"
                stroke="var(--theme-warn)"
                strokeWidth="0.5"
                strokeDasharray="3 2"
              />
            )}
            <text
              x={threshold.axis === 'y' ? 210 : 22 + (threshold.value / xMax) * 190}
              y={threshold.axis === 'y' ? 106 - (threshold.value / yMax) * 100 - 1.4 : 5}
              className="scatter-threshold-label"
              textAnchor={threshold.axis === 'y' ? 'end' : 'middle'}
              fill="var(--theme-warn)"
            >
              {threshold.label}
            </text>
          </g>
        )}
        {/* points */}
        {points.map((p) => {
          const status = p.status ?? 'neutral';
          const color = status === 'good' ? 'var(--theme-good)' : status === 'warn' ? 'var(--theme-warn)' : status === 'danger' ? 'var(--theme-danger)' : 'var(--theme-accent-2)';
          const cx = 22 + (Math.max(0, Math.min(xMax, p.x)) / xMax) * 190;
          const cy = 106 - (Math.max(0, Math.min(yMax, p.y)) / yMax) * 100;
          const r = 1 + (p.size ?? 1) * 0.6;
          return (
            <g key={p.id} className={`scatter-point status-${status}`}>
              <circle cx={cx} cy={cy} r={r * 2} fill={color} opacity="0.18" />
              <circle cx={cx} cy={cy} r={r} fill={color} style={{ filter: `drop-shadow(0 0 1.5px ${color})` }} />
              {p.label && (
                <text x={cx} y={cy - r - 1} className="scatter-point-label" textAnchor="middle" fill={color}>{p.label}</text>
              )}
            </g>
          );
        })}
        {/* axis labels */}
        <text x="116" y="124" className="scatter-axis-label" textAnchor="middle">{xLabel}</text>
        <text x="6" y="56" className="scatter-axis-label" textAnchor="middle" transform="rotate(-90 6 56)">{yLabel}</text>
      </svg>
    </div>
  );
}

/* -------------------- Light-weight ticker hook --------------------
   Returns a monotonically increasing tick that updates on a
   configurable interval, useful for retiming widgets that do
   not receive a snapshot. */

export function useTick(intervalMs = 1600): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handle = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(handle);
  }, [intervalMs]);
  return tick;
}

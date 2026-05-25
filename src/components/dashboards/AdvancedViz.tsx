import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';

/**
 * Advanced visualization widgets for the HUD dashboard. Every component here
 * subscribes to the same live telemetry snapshot so the entire surface
 * animates in lockstep with the cluster pulse. All shapes are inline SVG and
 * styled via classes in src/styles.css so they pick up the active theme.
 */

interface AdvancedVizProps {
  telemetry: EnvironmentSnapshot;
}

const REGIONS = [
  { id: 'iad', label: 'us-east / iad', cx: 28, cy: 41, role: 'control-plane' as const, nodes: 18 },
  { id: 'sfo', label: 'us-west / sfo', cx: 14, cy: 44, role: 'edge' as const, nodes: 12 },
  { id: 'lhr', label: 'eu-west / lhr', cx: 49, cy: 35, role: 'edge' as const, nodes: 9 },
  { id: 'fra', label: 'eu-central / fra', cx: 52, cy: 38, role: 'storage' as const, nodes: 14 },
  { id: 'sin', label: 'apac / sin', cx: 72, cy: 56, role: 'edge' as const, nodes: 7 },
  { id: 'syd', label: 'apac / syd', cx: 86, cy: 73, role: 'failover' as const, nodes: 5 },
  { id: 'gru', label: 'sa-east / gru', cx: 34, cy: 70, role: 'edge' as const, nodes: 4 },
  { id: 'jnb', label: 'af-south / jnb', cx: 55, cy: 71, role: 'edge' as const, nodes: 3 },
] as const;

const LINKS = [
  ['iad', 'sfo'],
  ['iad', 'lhr'],
  ['lhr', 'fra'],
  ['iad', 'gru'],
  ['fra', 'sin'],
  ['sin', 'syd'],
  ['fra', 'jnb'],
  ['lhr', 'iad'],
] as const;

/**
 * Stylized world map showing federated control-plane regions, replication
 * links, and animated synchronization pulses. The latency rings and packet
 * dots speed up when ingress traffic spikes in the live telemetry.
 */
export function GeoClusterMap({ telemetry }: AdvancedVizProps) {
  const intensity = Math.min(1, telemetry.ingressMbps / 110_000);
  const pulseDuration = (4 - intensity * 2.2).toFixed(2);
  const regionMap = useMemo(() => new Map(REGIONS.map((r) => [r.id, r])), []);

  return (
    <article className="hud-panel hud-geo-map" aria-label="Federated cluster geographic distribution">
      <div className="hud-panel-title">
        <span>Federated regions</span>
        <strong>{REGIONS.length} regions · {REGIONS.reduce((s, r) => s + r.nodes, 0)} nodes</strong>
      </div>
      <div className="hud-geo-stage">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="geo-link-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--theme-accent)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="geo-region-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.75" />
              <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
            </radialGradient>
            <pattern id="geo-grid" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M5 0H0V5" stroke="currentColor" strokeWidth="0.18" fill="none" opacity="0.18" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#geo-grid)" />
          {/* sketched continent silhouettes (highly stylized, viewBox 0-100) */}
          <g className="geo-continents" fill="currentColor" opacity="0.18">
            <path d="M6 30 Q14 22 22 24 L28 26 L34 32 L30 42 L22 50 L14 48 L8 42 Z" />
            <path d="M22 60 L30 56 L36 64 L34 76 L26 84 L20 78 L18 70 Z" />
            <path d="M44 22 L54 20 L62 26 L58 36 L52 38 L44 32 Z" />
            <path d="M48 42 L60 40 L62 56 L56 72 L50 70 L48 56 Z" />
            <path d="M62 28 L78 28 L88 38 L84 52 L74 58 L66 50 Z" />
            <path d="M76 64 L92 66 L90 78 L80 82 L74 76 Z" />
          </g>
          {LINKS.map(([fromId, toId], i) => {
            const from = regionMap.get(fromId);
            const to = regionMap.get(toId);
            if (!from || !to) return null;
            const mx = (from.cx + to.cx) / 2;
            const my = (from.cy + to.cy) / 2 - 8;
            const d = `M${from.cx} ${from.cy} Q ${mx} ${my} ${to.cx} ${to.cy}`;
            return (
              <g key={`${fromId}-${toId}`} className="geo-link">
                <path d={d} className="geo-link-base" />
                <path d={d} className="geo-link-pulse" stroke="url(#geo-link-grad)" style={{ animationDuration: `${pulseDuration}s`, animationDelay: `${i * 0.3}s` }} />
                <circle r="0.9" className="geo-packet">
                  <animateMotion dur={`${pulseDuration}s`} repeatCount="indefinite" path={d} begin={`${i * 0.4}s`} />
                </circle>
              </g>
            );
          })}
          {REGIONS.map((region) => (
            <g key={region.id} className={`geo-region role-${region.role}`} transform={`translate(${region.cx} ${region.cy})`}>
              <circle r="5" fill="url(#geo-region-glow)" />
              <circle r="2.4" className="geo-region-core" />
              <circle r="3.6" className="geo-region-ring" />
              <text y="-4.8" textAnchor="middle" className="geo-region-label">{region.label}</text>
              <text y="6" textAnchor="middle" className="geo-region-nodes">{region.nodes}n</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="hud-geo-legend">
        {(['control-plane', 'edge', 'storage', 'failover'] as const).map((role) => (
          <span key={role} className={`hud-geo-chip role-${role}`}><i />{role}</span>
        ))}
        <span className="hud-geo-chip hud-geo-rate">
          <i className="hud-live-dot" /> sync {Math.round(intensity * 100)}%
        </span>
      </div>
    </article>
  );
}

const FLOW_SOURCES = [
  { id: 'web-tier', label: 'web-tier', color: 'var(--theme-accent)' },
  { id: 'api-tier', label: 'api-tier', color: 'var(--theme-accent-2)' },
  { id: 'batch', label: 'batch', color: 'var(--theme-good)' },
  { id: 'ml-inference', label: 'ml-inference', color: 'var(--theme-warn, #ffd166)' },
] as const;

const FLOW_NAMESPACES = ['prod', 'staging', 'edge', 'platform'];

const FLOW_TARGETS = [
  { id: 'ceph-rbd', label: 'ceph-rbd' },
  { id: 'longhorn', label: 'longhorn' },
  { id: 'nvme-of', label: 'nvme-oF' },
  { id: 's3-archive', label: 's3-archive' },
];

/**
 * Three-column Sankey-style flow showing how workload traffic moves from
 * source tiers, through namespaces, into storage backends. Stroke widths
 * encode share of total IOPS and animate softly as the telemetry shifts.
 */
export function SankeyFlowDiagram({ telemetry }: AdvancedVizProps) {
  // Deterministic-but-shifting allocation per source/namespace/target
  const seed = telemetry.tick;
  const total = telemetry.totalIops;
  const sourceShares = useMemo(() => {
    const base = [0.38, 0.28, 0.2, 0.14];
    return FLOW_SOURCES.map((src, i) => ({
      ...src,
      share: base[i] + Math.sin(seed * 0.31 + i) * 0.04,
    }));
  }, [seed]);
  const targetShares = useMemo(() => {
    const base = [0.34, 0.26, 0.24, 0.16];
    return FLOW_TARGETS.map((t, i) => ({
      ...t,
      share: base[i] + Math.cos(seed * 0.28 + i * 1.3) * 0.04,
    }));
  }, [seed]);

  const layoutLane = (count: number, height: number) =>
    Array.from({ length: count }, (_, i) => height * ((i + 0.5) / count));

  const srcY = layoutLane(FLOW_SOURCES.length, 100);
  const nsY = layoutLane(FLOW_NAMESPACES.length, 100);
  const tgtY = layoutLane(FLOW_TARGETS.length, 100);

  return (
    <article className="hud-panel hud-sankey" aria-label="Workload to storage data flow">
      <div className="hud-panel-title">
        <span>Workload → storage flow</span>
        <strong>{(total / 1000).toFixed(0)} K iops in transit</strong>
      </div>
      <div className="hud-sankey-stage">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {sourceShares.map((src) => (
              <linearGradient key={`src-grad-${src.id}`} id={`sankey-grad-${src.id}`} x1="0%" x2="100%">
                <stop offset="0%" stopColor={src.color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={src.color} stopOpacity="0.18" />
              </linearGradient>
            ))}
          </defs>
          {/* Source-to-namespace bands */}
          {sourceShares.map((src, sIdx) =>
            FLOW_NAMESPACES.map((_, nIdx) => {
              const w = Math.max(1.4, src.share * 18) * (0.6 + ((sIdx + nIdx) % 3) * 0.18);
              const y1 = srcY[sIdx];
              const y2 = nsY[nIdx];
              const d = `M12 ${y1} C 30 ${y1}, 32 ${y2}, 50 ${y2}`;
              return (
                <path key={`${src.id}-${nIdx}`} d={d} className="sankey-band" stroke={`url(#sankey-grad-${src.id})`} strokeWidth={w} fill="none" style={{ animationDelay: `${(sIdx * 4 + nIdx) * 90}ms` } as CSSProperties} />
              );
            })
          )}
          {/* Namespace-to-target bands */}
          {FLOW_NAMESPACES.map((_, nIdx) =>
            targetShares.map((t, tIdx) => {
              const w = Math.max(1.2, t.share * 16) * (0.6 + ((nIdx + tIdx) % 4) * 0.15);
              const y1 = nsY[nIdx];
              const y2 = tgtY[tIdx];
              const d = `M50 ${y1} C 70 ${y1}, 72 ${y2}, 90 ${y2}`;
              return (
                <path key={`ns${nIdx}-${t.id}`} d={d} className="sankey-band sankey-band-2" strokeWidth={w} fill="none" style={{ animationDelay: `${(nIdx * 4 + tIdx) * 90 + 400}ms` } as CSSProperties} />
              );
            })
          )}
          {/* Node columns */}
          {sourceShares.map((src, i) => (
            <g key={src.id} transform={`translate(8 ${srcY[i] - 3.2})`}>
              <rect width="6" height="6.4" rx="1.2" className="sankey-node" style={{ fill: src.color }} />
              <text x="-1.2" y="4.4" textAnchor="end" className="sankey-label">{src.label}</text>
              <text x="-1.2" y="8.4" textAnchor="end" className="sankey-sub">{Math.round(src.share * total / 1000)}K</text>
            </g>
          ))}
          {FLOW_NAMESPACES.map((name, i) => (
            <g key={name} transform={`translate(47 ${nsY[i] - 3.2})`}>
              <rect width="6" height="6.4" rx="1.2" className="sankey-node sankey-node-ns" />
              <text x="3" y="-1" textAnchor="middle" className="sankey-label">{name}</text>
            </g>
          ))}
          {targetShares.map((t, i) => (
            <g key={t.id} transform={`translate(86 ${tgtY[i] - 3.2})`}>
              <rect width="6" height="6.4" rx="1.2" className="sankey-node sankey-node-target" />
              <text x="9" y="4.4" textAnchor="start" className="sankey-label">{t.label}</text>
              <text x="9" y="8.4" textAnchor="start" className="sankey-sub">{Math.round(t.share * total / 1000)}K</text>
            </g>
          ))}
        </svg>
      </div>
    </article>
  );
}

const HEATMAP_NODES = ['cp-01', 'cp-02', 'edge-a', 'edge-b', 'edge-c', 'gpu-01', 'gpu-02', 'store-01', 'store-02'];
const HEATMAP_HOURS = 24;

/**
 * Rolling per-node, per-hour utilization heatmap that shifts each tick to give
 * a sense of streaming history. Color is a five-stop ramp from quiet cool to
 * hot magenta so spikes pop visually.
 */
export function ActivityHeatmap({ telemetry }: AdvancedVizProps) {
  const matrix = useMemo(() => {
    return HEATMAP_NODES.map((node, nodeIdx) =>
      Array.from({ length: HEATMAP_HOURS }, (_, hour) => {
        const base = 0.45 + Math.sin((hour + telemetry.tick + nodeIdx) * 0.45) * 0.18;
        const burst = nodeIdx === (telemetry.tick % HEATMAP_NODES.length) ? 0.25 : 0;
        const noise = ((Math.sin(hour * 1.3 + nodeIdx * 2.1) + 1) / 2) * 0.35;
        const value = Math.max(0.04, Math.min(1, base + burst + noise * 0.4));
        return { node, hour, value };
      })
    );
  }, [telemetry.tick]);

  const cellColor = (v: number) => {
    // 5-stop ramp: deep navy -> teal -> green -> amber -> magenta
    const stops = [
      [9, 18, 36],
      [16, 90, 130],
      [40, 200, 168],
      [255, 196, 78],
      [255, 78, 200],
    ];
    const scaled = v * (stops.length - 1);
    const i = Math.floor(scaled);
    const t = scaled - i;
    const a = stops[Math.min(i, stops.length - 1)];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
    return `rgb(${lerp(a[0], b[0])}, ${lerp(a[1], b[1])}, ${lerp(a[2], b[2])})`;
  };

  return (
    <article className="hud-panel hud-heatmap" aria-label="Per-node utilization heatmap by hour">
      <div className="hud-panel-title">
        <span>24h utilization heatmap</span>
        <strong>{HEATMAP_NODES.length} nodes · {HEATMAP_HOURS}h window</strong>
      </div>
      <div className="hud-heatmap-grid" style={{ gridTemplateColumns: `5rem repeat(${HEATMAP_HOURS}, 1fr)` }}>
        <span />
        {Array.from({ length: HEATMAP_HOURS }, (_, h) => (
          <span key={`h-${h}`} className="hud-heatmap-hour">{h.toString().padStart(2, '0')}</span>
        ))}
        {matrix.map((row, rIdx) => (
          <Fragment key={HEATMAP_NODES[rIdx]}>
            <span className="hud-heatmap-node">{HEATMAP_NODES[rIdx]}</span>
            {row.map((cell, cIdx) => (
              <i
                key={`${rIdx}-${cIdx}`}
                className="hud-heatmap-cell"
                style={{
                  background: cellColor(cell.value),
                  opacity: 0.55 + cell.value * 0.45,
                  animationDelay: `${(rIdx * HEATMAP_HOURS + cIdx) * 4}ms`,
                } as CSSProperties}
                title={`${cell.node} @ ${cell.hour}h · ${Math.round(cell.value * 100)}%`}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="hud-heatmap-scale" aria-hidden="true">
        <span>0%</span>
        <div className="hud-heatmap-ramp" />
        <span>100%</span>
      </div>
    </article>
  );
}

// Tiny local Fragment so we don't have to import React.Fragment everywhere.
function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const STREAM_SERIES = [
  { id: 'cpu', label: 'cpu', color: '#33f7ff' },
  { id: 'ram', label: 'ram', color: '#7c3bff' },
  { id: 'io', label: 'io', color: '#36d399' },
  { id: 'net', label: 'net', color: '#ffd166' },
  { id: 'gpu', label: 'gpu', color: '#ff4af7' },
] as const;

const STREAM_LENGTH = 48;

/**
 * Multi-series streaming area chart. Maintains a rolling window of normalized
 * values driven by live telemetry deltas. Stacks render as overlapping
 * translucent gradient areas with bright polylines on top.
 */
export function StreamingAreaChart({ telemetry }: AdvancedVizProps) {
  const buffersRef = useRef<Map<string, number[]>>(new Map());

  // Seed the buffers once with a synthetic warm-up so the chart isn't empty.
  if (buffersRef.current.size === 0) {
    STREAM_SERIES.forEach((series, idx) => {
      const seeded = Array.from({ length: STREAM_LENGTH }, (_, i) => {
        const phase = (i / STREAM_LENGTH) * Math.PI * 2;
        return 45 + Math.sin(phase + idx) * 18 + Math.cos(phase * 0.7 + idx * 0.4) * 9;
      });
      buffersRef.current.set(series.id, seeded);
    });
  }

  const [, force] = useState(0);
  useEffect(() => {
    const sample = {
      cpu: telemetry.cpuPercent,
      ram: telemetry.ramPercent,
      io: 30 + (telemetry.totalIops / 1_400_000) * 60,
      net: 20 + (telemetry.ingressMbps / 110_000) * 70,
      gpu: 25 + ((telemetry.tick * 13) % 65),
    } as Record<string, number>;
    STREAM_SERIES.forEach((s) => {
      const buf = buffersRef.current.get(s.id);
      if (!buf) return;
      buf.shift();
      buf.push(Math.max(2, Math.min(99, sample[s.id])));
    });
    force((n) => n + 1);
  }, [telemetry.tick]);

  const buildArea = (vals: number[]) => {
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${100 - v}`).join(' ');
    return `M0,100 L${pts.split(' ').join(' L')} L100,100 Z`;
  };
  const buildLine = (vals: number[]) =>
    vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${100 - v}`).join(' ');

  return (
    <article className="hud-panel hud-stream-chart" aria-label="Multi-series streaming utilization">
      <div className="hud-panel-title">
        <span>Stacked telemetry stream</span>
        <strong>{STREAM_SERIES.length} series · {STREAM_LENGTH}-sample window</strong>
      </div>
      <div className="hud-stream-stage">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {STREAM_SERIES.map((s) => (
              <linearGradient key={`stream-${s.id}`} id={`stream-grad-${s.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
            <pattern id="stream-grid" x="0" y="0" width="10" height="20" patternUnits="userSpaceOnUse">
              <path d="M0 0H100" stroke="currentColor" strokeWidth="0.2" opacity="0.18" />
              <path d="M0 0V20" stroke="currentColor" strokeWidth="0.2" opacity="0.12" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#stream-grid)" />
          {STREAM_SERIES.map((s) => {
            const buf = buffersRef.current.get(s.id) ?? [];
            return (
              <g key={s.id} className="hud-stream-series">
                <path d={buildArea(buf)} fill={`url(#stream-grad-${s.id})`} />
                <polyline points={buildLine(buf)} fill="none" stroke={s.color} strokeWidth="0.6" strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="hud-stream-legend">
        {STREAM_SERIES.map((s) => {
          const buf = buffersRef.current.get(s.id) ?? [];
          const now = Math.round(buf[buf.length - 1] ?? 0);
          return (
            <span key={s.id} className="hud-stream-chip">
              <i style={{ background: s.color }} />
              <b>{s.label}</b>
              <em>{now}</em>
            </span>
          );
        })}
      </div>
    </article>
  );
}

const CHORD_SERVICES = [
  { id: 'gateway', label: 'gateway', color: '#33f7ff' },
  { id: 'auth', label: 'auth', color: '#7c3bff' },
  { id: 'api', label: 'api', color: '#36d399' },
  { id: 'orders', label: 'orders', color: '#ffd166' },
  { id: 'billing', label: 'billing', color: '#ff4af7' },
  { id: 'ledger', label: 'ledger', color: '#ff8c2a' },
  { id: 'notify', label: 'notify', color: '#a4f9ff' },
  { id: 'search', label: 'search', color: '#67e8f9' },
];

const CHORD_EDGES: Array<[string, string, number]> = [
  ['gateway', 'auth', 0.92],
  ['gateway', 'api', 0.86],
  ['api', 'orders', 0.74],
  ['orders', 'billing', 0.62],
  ['billing', 'ledger', 0.55],
  ['orders', 'notify', 0.31],
  ['api', 'search', 0.48],
  ['auth', 'ledger', 0.22],
  ['gateway', 'orders', 0.4],
  ['api', 'billing', 0.36],
];

/**
 * Circular chord-style dependency diagram for a microservice mesh. Edge
 * opacity / width encodes call volume; live telemetry tick rotates the
 * active highlight, simulating a live trace sweep.
 */
export function ServiceMeshChord({ telemetry }: AdvancedVizProps) {
  const n = CHORD_SERVICES.length;
  const r = 36;
  const positions = useMemo(
    () =>
      CHORD_SERVICES.map((svc, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        return {
          ...svc,
          x: 50 + Math.cos(angle) * r,
          y: 50 + Math.sin(angle) * r,
          angle,
        };
      }),
    [n]
  );
  const byId = new Map(positions.map((p) => [p.id, p]));
  const sweepIndex = telemetry.tick % CHORD_EDGES.length;

  return (
    <article className="hud-panel hud-chord" aria-label="Service mesh dependency chord diagram">
      <div className="hud-panel-title">
        <span>Service mesh chord</span>
        <strong>{n} services · {CHORD_EDGES.length} edges</strong>
      </div>
      <div className="hud-chord-stage">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id="chord-center" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="38" fill="url(#chord-center)" />
          <circle cx="50" cy="50" r="36" className="chord-ring" />
          <circle cx="50" cy="50" r="30" className="chord-ring chord-ring-inner" />
          {CHORD_EDGES.map(([fromId, toId, weight], i) => {
            const from = byId.get(fromId);
            const to = byId.get(toId);
            if (!from || !to) return null;
            const d = `M${from.x} ${from.y} Q 50 50 ${to.x} ${to.y}`;
            const isActive = i === sweepIndex;
            return (
              <path
                key={`${fromId}-${toId}`}
                d={d}
                className={`chord-edge ${isActive ? 'is-active' : ''}`}
                strokeWidth={(0.6 + weight * 2.4).toFixed(2)}
                style={{
                  stroke: from.color,
                  opacity: 0.25 + weight * 0.55,
                } as CSSProperties}
              />
            );
          })}
          {positions.map((p) => (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`} className="chord-node">
              <circle r="3.2" style={{ fill: p.color }} />
              <circle r="5.4" className="chord-node-halo" style={{ stroke: p.color }} />
              <text
                x={Math.cos(p.angle) * 6}
                y={Math.sin(p.angle) * 6 + 1}
                textAnchor={Math.cos(p.angle) > 0.2 ? 'start' : Math.cos(p.angle) < -0.2 ? 'end' : 'middle'}
                className="chord-label"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="hud-chord-legend">
        {CHORD_EDGES.slice(0, 4).map(([from, to, w], i) => (
          <span key={`${from}-${to}`} className={`hud-chord-chip ${i === sweepIndex % 4 ? 'is-active' : ''}`}>
            <b>{from}</b>
            <em>→</em>
            <b>{to}</b>
            <i>{Math.round(w * 100)}rps</i>
          </span>
        ))}
      </div>
    </article>
  );
}

/**
 * Wraps the five advanced visualizations into a single grid section so they
 * can be slotted into the HUD dashboard with one element.
 */
export function AdvancedVisualizationGrid({ telemetry }: AdvancedVizProps) {
  return (
    <section className="hud-advanced-grid" aria-label="Advanced visualizations">
      <GeoClusterMap telemetry={telemetry} />
      <ServiceMeshChord telemetry={telemetry} />
      <SankeyFlowDiagram telemetry={telemetry} />
      <StreamingAreaChart telemetry={telemetry} />
      <ActivityHeatmap telemetry={telemetry} />
    </section>
  );
}

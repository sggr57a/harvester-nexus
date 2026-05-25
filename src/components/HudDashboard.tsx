import type { CSSProperties } from 'react';
import { buildHudTelemetry } from '../lib/hudTelemetry';

const telemetry = buildHudTelemetry();

const areaPoints =
  `0,100 ` +
  telemetry.lineSeries
    .map((v, i) => `${(i / (telemetry.lineSeries.length - 1)) * 100},${100 - v}`)
    .join(' ') +
  ` 100,100`;

const linePoints = telemetry.lineSeries
  .map((v, i) => `${(i / (telemetry.lineSeries.length - 1)) * 100},${100 - v}`)
  .join(' ');

/** SVG arc radial gauge — theme-colored */
function RadialGauge({
  value,
  label,
  sublabel = '',
  size = 88,
  stroke = 6,
  status = 'stable',
}: {
  value: number;
  label: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  status?: 'stable' | 'active' | 'surging';
}) {
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  const cx = size / 2, cy = size / 2;
  return (
    <svg className="hud-gauge-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${label}: ${value}%`}>
      <circle className="gauge-track" cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className={`gauge-fill gauge-status-${status}`}
        cx={cx} cy={cy} r={r}
        fill="none" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text className="gauge-pct" x={cx} y={cy + 2} textAnchor="middle" fontSize={size * 0.2} fontWeight="800" dominantBaseline="middle">{value}</text>
      <text className="gauge-lbl" x={cx} y={cy + size * 0.22} textAnchor="middle" fontSize={size * 0.11} dominantBaseline="middle">%</text>
      {sublabel && <text className="gauge-sublbl" x={cx} y={size - 6} textAnchor="middle" fontSize={size * 0.1}>{sublabel}</text>}
    </svg>
  );
}

/** Sparkline strip */
function Sparkline({ samples, w = 110, h = 32 }: { samples: number[]; w?: number; h?: number }) {
  const max = Math.max(...samples, 1);
  const pts = samples.map((v, i) => `${(i / (samples.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <div className="sparkline-wrap" style={{ width: w, height: h }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none">
        <polygon points={area} />
        <polyline points={pts} fill="none" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

/** Hex topology — the central visualization panel */
function HexTopology() {
  const nodes = telemetry.nodes;
  const edges = [
    { from: 'n1', to: 'n2' }, { from: 'n1', to: 'n3' },
    { from: 'n2', to: 'n4' }, { from: 'n3', to: 'n4' },
    { from: 'n1', to: 'n4' },
  ];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Additional mini hex cells for background
  const hexCells: { cx: number; cy: number; r: number; key: string }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = col * 13 + (row % 2 === 0 ? 0 : 6.5) + 6;
      const cy = row * 11 + 8;
      hexCells.push({ cx, cy, r: 4.5, key: `h-${row}-${col}` });
    }
  }

  return (
    <svg viewBox="0 0 100 60" className="hud-topo-svg" aria-label="Cluster topology">
      <defs>
        <radialGradient id="topoGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="topo-glow-stop-0" />
          <stop offset="100%" className="topo-glow-stop-100" stopOpacity="0" />
        </radialGradient>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Hex grid bg */}
      {hexCells.map(({ cx, cy, r, key }) => (
        <polygon
          key={key}
          className="topo-hex-cell"
          points={Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          }).join(' ')}
        />
      ))}

      {/* Glow center */}
      <ellipse cx="50" cy="30" rx="26" ry="18" fill="url(#topoGlow)" opacity="0.3" />

      {/* Edge routes */}
      {edges.map((edge) => {
        const a = nodeMap.get(edge.from), b = nodeMap.get(edge.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12;
        const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
        const d = `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
        return (
          <g key={`${edge.from}-${edge.to}`}>
            <path d={d} className="topo-edge-bg" />
            <path d={d} className="topo-edge-pulse" strokeDasharray="3 6" />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.x} ${node.y})`} filter="url(#nodeGlow)">
          <circle r="5.2" className="topo-node-halo" />
          <circle r="3.2" className="topo-node-ring" />
          <circle r="1.8" className={`topo-node-core topo-node-${node.status}`} />
          <text y="-6.5" textAnchor="middle" className="topo-node-label">{node.label}</text>
          <text y="8" textAnchor="middle" className="topo-node-health">
            {node.status === 'online' ? '●ONLINE' : node.status === 'syncing' ? '⟳SYNC' : '◉WATCH'}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HudDashboard() {
  return (
    <section className="hud-dashboard" aria-label="Animated Nexus cluster dashboard mockup">
      <div className="hud-scanlines" />
      <div className="hud-orb hud-orb-left" />
      <div className="hud-orb hud-orb-right" />
      <div className="banner-corner banner-corner-tl" />
      <div className="banner-corner banner-corner-tr" />
      <div className="banner-corner banner-corner-bl" />
      <div className="banner-corner banner-corner-br" />
      <div className="banner-micro-labels" aria-hidden="true">
        {telemetry.microLabels.map((l) => <span key={l}>{l}</span>)}
      </div>

      {/* ── Row 1: Hero header ── */}
      <div className="hud-hero hud-panel">
        <div className="hud-hero-left">
          <span className="hud-kicker">NEXUS // HARVESTER CONTROL</span>
          <h2>Live cluster command surface</h2>
          <p>Animated telemetry · validation · apply readiness · storage health · mesh targeting</p>
        </div>
        <div className="hud-hero-right">
          <div className="hud-status-pill">
            <span className="hud-live-dot" />
            DEMO STREAM ACTIVE
          </div>
          <div className="hud-cluster-stats">
            {[['NODES','4'],['PODS','38'],['VMS','12'],['PVCs','24'],['ALERTS','2']].map(([k,v]) => (
              <div key={k}><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: Nav + controls ── */}
      <div className="hud-controls-row">
        <nav className="hud-segment-menu hud-drawn-menu hud-panel" aria-label="HUD dashboard modes">
          {telemetry.navigationTabs.map((tab, i) => (
            <button className={tab.active ? 'is-selected' : ''} key={tab.id} type="button" style={{ animationDelay: `${i * 120}ms` }}>
              <span>{tab.signal}</span>{tab.label}
            </button>
          ))}
        </nav>
        <div className="hud-control-surfaces hud-panel">
          {telemetry.controlSurfaces.map((surf, i) => (
            <details className={`hud-fold-control fold-${surf.animation}`} key={surf.label} open={i < 2}>
              <summary><span>{surf.animation}</span><strong>{surf.label}</strong></summary>
              <div>
                {surf.options.map((opt, oi) => (
                  <button className={opt.active ? 'is-selected' : ''} key={opt.label} type="button" style={{ animationDelay: `${(i + oi) * 80}ms` }}>
                    <span>{opt.signal}</span>{opt.label}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
        <div className="hud-select-panel hud-panel">
          <label className="hud-select-shell">
            <span>Target cluster</span>
            <select value="edge-a-vcluster" onChange={() => undefined}>
              <option>edge-a / vcluster</option>
              <option>edge-b / vcluster</option>
              <option>control-plane</option>
            </select>
          </label>
          <div className="hud-status-rails-mini">
            {telemetry.statusRails.slice(0, 3).map((r) => (
              <div className="banner-status-rail" key={r.label}>
                <span>{r.label}</span>
                <i><b style={{ width: `${r.value}%` }} /></i>
                <strong>{r.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Central topology + side gauges ── */}
      <div className="hud-main-row">
        {/* Topology panel */}
        <article className="hud-panel hud-topology-panel">
          <div className="hud-panel-title">
            <span>Cluster topology · {telemetry.nodes.length} nodes</span>
            <strong>mesh active</strong>
          </div>
          <HexTopology />
          <div className="topo-legend">
            <span className="topo-leg online">●&nbsp;ONLINE</span>
            <span className="topo-leg syncing">⟳&nbsp;SYNCING</span>
            <span className="topo-leg watching">◉&nbsp;WATCH</span>
          </div>
        </article>

        {/* Right side column */}
        <div className="hud-side-col">
          {/* Storage rings */}
          <article className="hud-panel hud-storage">
            <div className="hud-panel-title"><span>CSI storage rings</span><strong>green path</strong></div>
            <div className="hud-rings">
              {telemetry.storageRings.map((ring) => (
                <div className="hud-ring" key={ring.label} style={{ '--ring-value': `${ring.value * 3.6}deg` } as CSSProperties}>
                  <div className="hud-ring-core"><strong>{ring.value}%</strong><span>{ring.label}</span></div>
                </div>
              ))}
            </div>
          </article>

          {/* Widget drawer */}
          <article className="hud-panel hud-widget-drawer-compact">
            <div className="hud-panel-title"><span>live graphs</span><strong>trace feeds</strong></div>
            <div className="hud-widget-compact-grid">
              {telemetry.graphWidgets.map((w, wi) => (
                <div className="hud-compact-widget" key={w.label} style={{ animationDelay: `${w.drawDelayMs}ms` }}>
                  <span>{w.label}</span>
                  {w.renderMode === 'matrix' ? (
                    <div className="hud-widget-matrix hud-widget-matrix-sm">
                      {w.samples.map((s, si) => <i className={s ? 'is-lit' : ''} key={`${w.label}-${si}`} />)}
                    </div>
                  ) : (
                    <div className="hud-widget-graph hud-widget-graph-sm">
                      {w.samples.map((s, si) => (
                        <span key={`${w.label}-${si}`} style={{ '--sample': `${s}%`, animationDelay: `${(wi + si) * 45}ms` } as CSSProperties} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>

          {/* Scan windows */}
          <article className="hud-panel banner-scan-stack">
            <div className="hud-panel-title"><span>Scan windows</span><strong>lab feed</strong></div>
            {telemetry.scanPanels.map((panel) => (
              <div className="banner-scan-card" key={panel.label}>
                <div className="banner-scan-visual"><span /><i /></div>
                <div>
                  <strong>{panel.label}</strong>
                  <code>{panel.value}</code>
                  <div className="banner-mini-bars">
                    {panel.bars.map((bar, bi) => <b key={`${panel.label}-${bi}`} style={{ width: `${bar}%` }} />)}
                  </div>
                </div>
              </div>
            ))}
          </article>
        </div>
      </div>

      {/* ── Row 4: Gauge grid ── */}
      <div className="hud-gauge-grid">
        {telemetry.metrics.map((m) => (
          <article className={`hud-panel hud-gauge-card hud-status-${m.status}`} key={m.label}>
            <RadialGauge value={m.value} label={m.label} size={76} stroke={6} status={m.status} />
            <div className="hud-gauge-info">
              <span className="hud-gauge-label">{m.label}</span>
              <strong className="hud-gauge-trend">{m.trend}</strong>
            </div>
          </article>
        ))}
      </div>

      {/* ── Row 5: Waveform + toggles + feed + radio ── */}
      <div className="hud-bottom-row">
        {/* Waveform */}
        <article className="hud-panel hud-waveform">
          <div className="hud-panel-title"><span>Resource waveform</span><strong>sync trace</strong></div>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true" className="hud-wave-svg">
            <polygon points={areaPoints} opacity="0.14" />
            <polyline points={linePoints} />
            {telemetry.lineSeries.map((v, i) => (
              <circle key={`v-${i}`} cx={(i / (telemetry.lineSeries.length - 1)) * 100} cy={60 - v * 0.6} r="1.5" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </svg>
          <div className="hud-sparkline-row">
            {[
              { label: 'CPU', samples: [18, 24, 46, 62, 55, 71, 82, 88, 76, 94] },
              { label: 'RAM', samples: [54, 61, 58, 72, 68, 74, 81, 77, 84, 91] },
              { label: 'NET', samples: [32, 51, 44, 68, 72, 85, 79, 88, 91, 96] },
            ].map((s) => (
              <div key={s.label}>
                <span>{s.label}</span>
                <Sparkline samples={s.samples} w={78} h={22} />
              </div>
            ))}
          </div>
        </article>

        {/* Throughput */}
        <article className="hud-panel hud-throughput">
          <div className="hud-panel-title"><span>Apply wave</span><strong>live preview</strong></div>
          <div className="hud-bars">
            {telemetry.throughputBars.map((bar, i) => (
              <span key={`${bar}-${i}`} style={{ height: `${bar}%`, animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
          <div className="hud-data-ribbon">
            <span>validate</span><span>dry-run</span><span>diff</span><span>apply</span>
          </div>
        </article>

        {/* Toggle bank */}
        <article className="hud-panel hud-toggle-bank">
          <div className="hud-panel-title"><span>Control toggles</span><strong>armed</strong></div>
          <div className="hud-toggle-grid">
            {telemetry.toggles.map((t) => (
              <div className={t.enabled ? 'hud-toggle is-on' : 'hud-toggle'} key={t.label}>
                <span>{t.label}</span><i />
              </div>
            ))}
          </div>
        </article>

        {/* Event feed */}
        <article className="hud-panel hud-feed">
          <div className="hud-panel-title"><span>Event stream</span><strong>5 signals</strong></div>
          <ul>
            {telemetry.eventFeed.map((ev) => (
              <li key={ev}><span />{ev}</li>
            ))}
          </ul>
        </article>

        {/* Radio matrix */}
        <div className="hud-panel hud-radio-panel">
          <div className="hud-panel-title"><span>Mode matrix</span><strong>armed</strong></div>
          <div className="banner-radio-matrix banner-radio-matrix-sm">
            {telemetry.radioGroups.map((group) => (
              <fieldset key={group.label}>
                <legend>{group.label}</legend>
                <div>
                  {group.options.map((opt) => (
                    <label className={opt.active ? 'banner-radio is-active' : 'banner-radio'} key={opt.label}>
                      <input type="radio" checked={opt.active} readOnly />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

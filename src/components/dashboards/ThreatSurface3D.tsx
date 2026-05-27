/**
 * ThreatSurface3D — a real-data XDR / SOC visualisation modelled after the
 * stock motion-graphics terrain HUD, but with every animated layer bound to
 * live data from the in-app `XdrEngine`:
 *
 *   - Terrain heightmap (X = endpoints, Y = MITRE ATT&CK tactics, Z =
 *     time-decayed severity-weighted alert load).
 *   - Heatmap colour ramp = real severity (info..critical).
 *   - Vertical scanline sweep fires when a new alert is ingested — its
 *     position in the grid corresponds to the endpoint whose alert just
 *     came in. NOT a timer.
 *   - Corner reticle locks on the surface peak — the endpoint × tactic
 *     under the heaviest active attack right now.
 *   - Rotating concentric rings spin at `alertsPerMin` rad/s.
 *   - Bottom dials = alerts/min, blocked 24h, isolated hosts, MTTD.
 *   - Side rails = top talkers (right) and severity histogram (left).
 *
 * No WebGL, no `three.js`, no new deps. Pure SVG + the cockpit's existing
 * theme tokens.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { isoProject, projectThreatSurface, heightToColour, topCells, TACTIC_ORDER } from '../../lib/xdr/threatSurface';
import type { ThreatSurface } from '../../lib/xdr/threatSurface';
import type { AttackTactic, Endpoint, XdrSnapshot } from '../../lib/xdr/types';

interface ThreatSurface3DProps {
  snapshot: XdrSnapshot;
  height?: number;
  /** Half-life for the height decay. Default 5 minutes. */
  halfLifeMs?: number;
}

const PITCH = 0.55;
const HEIGHT_SCALE = 18;
const CELL_W = 18;
const CELL_D = 12;

const SHORT_TACTIC_LABEL: Record<AttackTactic, string> = {
  reconnaissance: 'RECON',
  'resource-development': 'RES-DEV',
  'initial-access': 'IA',
  execution: 'EXEC',
  persistence: 'PRST',
  'privilege-escalation': 'PRIVESC',
  'defense-evasion': 'EVAS',
  'credential-access': 'CRED',
  discovery: 'DISC',
  'lateral-movement': 'LAT',
  collection: 'COLL',
  'command-and-control': 'C2',
  exfiltration: 'EXFIL',
  impact: 'IMPACT',
};

export function ThreatSurface3D({
  snapshot,
  height = 520,
  halfLifeMs = 5 * 60 * 1000,
}: ThreatSurface3DProps) {
  const surface: ThreatSurface = useMemo(
    () => projectThreatSurface({ alerts: snapshot.alerts, endpoints: snapshot.endpoints, halfLifeMs }),
    [snapshot.alerts, snapshot.endpoints, halfLifeMs],
  );
  const top = useMemo(() => topCells(surface, 6), [surface]);

  // Scanline sweep — re-keyed every time the most-recent alert id changes.
  // Reading off `snapshot.alerts` directly keeps the widget self-contained.
  const [sweepKey, setSweepKey] = useState(0);
  const [sweepEndpointIdx, setSweepEndpointIdx] = useState<number | null>(null);
  const lastAlertIdRef = useRef<string | null>(null);
  useEffect(() => {
    const fresh = snapshot.alerts.length > 0 ? snapshot.alerts[snapshot.alerts.length - 1] : null;
    if (!fresh || fresh.id === lastAlertIdRef.current) return;
    lastAlertIdRef.current = fresh.id;
    const epIdx = surface.endpoints.findIndex((e) => e.id === fresh.endpointId);
    setSweepEndpointIdx(epIdx >= 0 ? epIdx : null);
    setSweepKey((k) => k + 1);
  }, [snapshot.alerts, surface.endpoints]);

  // Compute an empty-state placeholder when no endpoints exist yet.
  const cols = surface.endpoints.length || 8;
  const rows = TACTIC_ORDER.length;

  // Centre the surface in the viewport.
  const widthPx = Math.round(CELL_W * (cols + rows) * 0.866 + 240);
  const viewBox = `${-widthPx / 2} ${-height / 2} ${widthPx} ${height}`;

  return (
    <article className="threat-surface-3d" style={{ ['--threat-surface-height' as string]: `${height}px` }}>
      <header className="threat-surface-header">
        <div>
          <span className="dash-kicker">XDR // THREAT SURFACE</span>
          <h3>Active threat surface</h3>
          <p className="threat-surface-sub">
            Live heightmap of severity-weighted, time-decayed alert load across
            every endpoint and every MITRE ATT&amp;CK tactic. Peaks rise as
            kill-chain phases trigger; sweep fires on every fresh detection.
          </p>
        </div>
        <ul className="threat-surface-dials">
          <Dial label="ALERTS/MIN" value={snapshot.stats.alertsPerMin} max={Math.max(60, snapshot.stats.alertsPerMin)} severity={alertsPerMinSeverity(snapshot.stats.alertsPerMin)} />
          <Dial label="BLOCKED 24H" value={snapshot.stats.blocked24h} max={Math.max(50, snapshot.stats.blocked24h)} severity="medium" />
          <Dial label="ISOLATED" value={snapshot.stats.isolatedHosts} max={Math.max(8, snapshot.stats.isolatedHosts)} severity="high" />
          <Dial label="MTTD" value={snapshot.stats.mttdSeconds} max={Math.max(60, snapshot.stats.mttdSeconds)} suffix="s" severity="low" inverse />
        </ul>
      </header>

      <div className="threat-surface-stage">
        <ConcentricRings rpm={snapshot.stats.alertsPerMin} />

        <svg className="threat-surface-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="3D threat surface">
          <defs>
            <filter id="surfaceGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" />
              <feComponentTransfer><feFuncA type="linear" slope="0.7" /></feComponentTransfer>
            </filter>
          </defs>

          {/* Wireframe rows (constant tactic) */}
          {Array.from({ length: rows }).map((_, ti) => {
            const points: string[] = [];
            for (let ei = 0; ei < cols; ei += 1) {
              const z = surface.endpoints[ei] ? surface.heights[ei * rows + ti] : 0;
              const p = isoProject({ x: ei, y: ti, z, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
              points.push(`${p.sx},${p.sy}`);
            }
            return <polyline key={`row-${ti}`} className="terrain-wire" points={points.join(' ')} />;
          })}

          {/* Wireframe columns (constant endpoint) */}
          {Array.from({ length: cols }).map((_, ei) => {
            const points: string[] = [];
            for (let ti = 0; ti < rows; ti += 1) {
              const z = surface.endpoints[ei] ? surface.heights[ei * rows + ti] : 0;
              const p = isoProject({ x: ei, y: ti, z, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
              points.push(`${p.sx},${p.sy}`);
            }
            return <polyline key={`col-${ei}`} className="terrain-wire" points={points.join(' ')} />;
          })}

          {/* Heatmap point cloud */}
          {surface.endpoints.map((_, ei) =>
            TACTIC_ORDER.map((_t, ti) => {
              const idx = ei * rows + ti;
              const h = surface.heights[idx];
              if (h <= 0) return null;
              const p = isoProject({ x: ei, y: ti, z: h, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
              const colour = heightToColour(h);
              const r = 1.4 + Math.min(3.6, h * 1.4);
              return (
                <g key={`pt-${ei}-${ti}`}>
                  <circle cx={p.sx} cy={p.sy} r={r * 1.8} fill={colour} opacity={0.18} filter="url(#surfaceGlow)" />
                  <circle cx={p.sx} cy={p.sy} r={r} fill={colour} />
                </g>
              );
            })
          )}

          {/* Stem from each lit cell down to its base — gives the terrain depth */}
          {surface.endpoints.map((_, ei) =>
            TACTIC_ORDER.map((_t, ti) => {
              const idx = ei * rows + ti;
              const h = surface.heights[idx];
              if (h <= 0.05) return null;
              const top = isoProject({ x: ei, y: ti, z: h, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
              const base = isoProject({ x: ei, y: ti, z: 0, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
              return (
                <line
                  key={`stem-${ei}-${ti}`}
                  className="terrain-stem"
                  x1={base.sx} y1={base.sy}
                  x2={top.sx} y2={top.sy}
                  stroke={heightToColour(h)}
                  strokeOpacity={0.3 + Math.min(0.55, h * 0.18)}
                />
              );
            })
          )}

          {/* Sweep — vertical column at the most-recently-attacked endpoint */}
          {sweepEndpointIdx !== null && (
            <SweepBeam
              key={sweepKey}
              endpointIndex={sweepEndpointIdx}
              rows={rows}
            />
          )}

          {/* Lock-on reticle on the peak */}
          {surface.peak && (
            <ReticleLock peak={surface.peak} />
          )}
        </svg>

        <CornerReticles />
      </div>

      <footer className="threat-surface-footer">
        <aside className="threat-surface-side">
          <h4>SEVERITY HISTOGRAM</h4>
          <ul className="threat-side-bars">
            {(['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => {
              const count = surface.severityHistogram[s];
              const total = Object.values(surface.severityHistogram).reduce((a, b) => a + b, 0) || 1;
              return (
                <li key={s} className={`sev-bar sev-${s}`}>
                  <span className="sev-label">{s.toUpperCase()}</span>
                  <span className="sev-track"><span className="sev-fill" style={{ width: `${(count / total) * 100}%` }} /></span>
                  <span className="sev-count">{count}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        <aside className="threat-surface-side threat-surface-side-right">
          <h4>TOP TALKERS</h4>
          <ul className="threat-side-talkers">
            {top.length === 0 && <li className="threat-side-empty">No alerts in the active window</li>}
            {top.map((cell) => (
              <li key={`${cell.endpointId}-${cell.tactic}`} className={`talker sev-${cell.topSeverity}`}>
                <span className="talker-id">{shortName(cell.endpointId)}</span>
                <span className="talker-tactic">{SHORT_TACTIC_LABEL[cell.tactic]}</span>
                <span className="talker-meter"><span className="talker-fill" style={{ width: `${Math.min(100, cell.height * 30)}%`, background: heightToColour(cell.height) }} /></span>
              </li>
            ))}
          </ul>
        </aside>
      </footer>
    </article>
  );
}

/* ============================================================
   Helpers
   ============================================================ */

function alertsPerMinSeverity(alertsPerMin: number): 'low' | 'medium' | 'high' | 'critical' {
  if (alertsPerMin >= 30) return 'critical';
  if (alertsPerMin >= 15) return 'high';
  if (alertsPerMin >= 5) return 'medium';
  return 'low';
}

function shortName(id: string): string {
  return id.length > 16 ? `${id.slice(0, 14)}…` : id;
}

interface DialProps {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** When true, the dial fills inversely (lower is more severe). */
  inverse?: boolean;
}

function Dial({ label, value, max, suffix, severity, inverse }: DialProps) {
  const ratio = inverse
    ? Math.max(0, Math.min(1, 1 - value / Math.max(1, max)))
    : Math.max(0, Math.min(1, value / Math.max(1, max)));
  const circumference = 2 * Math.PI * 18;
  return (
    <li className={`threat-dial sev-${severity}`}>
      <svg viewBox="0 0 48 48" width={56} height={56}>
        <circle cx="24" cy="24" r="18" className="dial-track" />
        <circle
          cx="24" cy="24" r="18"
          className="dial-fill"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 24 24)"
        />
        <text x="24" y="22" className="dial-value">{Math.round(value)}{suffix ?? ''}</text>
        <text x="24" y="32" className="dial-unit">{label}</text>
      </svg>
    </li>
  );
}

function ConcentricRings({ rpm }: { rpm: number }) {
  const speed = Math.max(8, 60 - Math.min(50, rpm));
  return (
    <div className="threat-rings" aria-hidden>
      <div className="ring ring-outer" style={{ animationDuration: `${speed}s` }} />
      <div className="ring ring-mid" style={{ animationDuration: `${speed * 0.7}s` }} />
      <div className="ring ring-inner" style={{ animationDuration: `${speed * 0.45}s` }} />
      <div className="ring ring-tick" style={{ animationDuration: `${speed * 1.5}s` }} />
    </div>
  );
}

function CornerReticles() {
  return (
    <div className="threat-reticles" aria-hidden>
      <span className="rt rt-tl" />
      <span className="rt rt-tr" />
      <span className="rt rt-bl" />
      <span className="rt rt-br" />
    </div>
  );
}

function SweepBeam({ endpointIndex, rows }: { endpointIndex: number; rows: number }) {
  // The sweep is a vertical beam in screen space at the endpoint's column.
  // Project the column's near (y=0) and far (y=rows-1) base points to get
  // the screen line.
  const near = isoProject({ x: endpointIndex, y: 0, z: 0, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
  const far = isoProject({ x: endpointIndex, y: rows - 1, z: 0, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
  return (
    <g className="threat-sweep">
      <line
        x1={near.sx} y1={near.sy - 200}
        x2={far.sx} y2={far.sy + 60}
        className="sweep-beam"
      />
    </g>
  );
}

function ReticleLock({ peak }: { peak: NonNullable<ThreatSurface['peak']> }) {
  const p = isoProject({ x: peak.endpointIndex, y: peak.tacticIndex, z: peak.height, cellWidth: CELL_W, cellDepth: CELL_D, heightScale: HEIGHT_SCALE, pitch: PITCH });
  return (
    <g className={`reticle-lock sev-${peak.topSeverity}`} transform={`translate(${p.sx} ${p.sy})`}>
      <circle r="14" className="lock-ring" />
      <circle r="20" className="lock-ring lock-ring-outer" />
      <line x1={-22} y1={0} x2={-9} y2={0} className="lock-tick" />
      <line x1={22} y1={0} x2={9} y2={0} className="lock-tick" />
      <line x1={0} y1={-22} x2={0} y2={-9} className="lock-tick" />
      <line x1={0} y1={22} x2={0} y2={9} className="lock-tick" />
      <text x={28} y={4} className="lock-label">
        {shortName(peak.endpointId)} · {SHORT_TACTIC_LABEL[peak.tactic]}
      </text>
    </g>
  );
}

/** Re-exports for unrelated consumers — used by `Endpoint` typing in the
 *  parent dashboard. */
export type { Endpoint };

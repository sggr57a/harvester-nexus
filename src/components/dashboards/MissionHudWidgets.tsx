/**
 * Mission Control HUD widgets — four data-bound primitives modelled after
 * the futuristic-HUD-infographic aesthetic (concentric rings, segmented
 * arcs, polar radar). Every animated layer reflects a real Nexus metric:
 *
 *   - CompliancePostureRings:  XdrSnapshot.compliance per framework
 *   - FastPathLaneStatus:      EnvironmentSnapshot.fastPathLanes
 *   - SloBurnGauges:           EnvironmentSnapshot.serviceSamples
 *   - DeceptionRadar:          XdrSnapshot.alerts (honeypot-touch only)
 *
 * No new dependencies — pure SVG + CSS, theme-token-driven.
 */

import { useMemo, useRef } from 'react';
import {
  aggregatePostureScore,
  projectCompliancePosture,
  type CompliancePostureRing,
} from '../../lib/compliancePosture';
import {
  lanesInDrop,
  projectFastPathLanes,
  totalLaneIops,
  type FastPathLaneView,
} from '../../lib/fastPathLanes';
import {
  projectAllBurnRates,
  type BurnRateView,
} from '../../lib/sloBurnRate';
import {
  polarToCartesian,
  projectDeceptionRadar,
  type DeceptionPing,
} from '../../lib/deceptionRadar';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import type { Alert, CompliancePosture, Endpoint } from '../../lib/xdr/types';

/* ============================================================
   1. Compliance Posture Rings
   ============================================================ */

interface CompliancePostureRingsProps {
  postures: CompliancePosture[];
  height?: number;
}

export function CompliancePostureRings({ postures, height = 220 }: CompliancePostureRingsProps) {
  const rings = useMemo(() => projectCompliancePosture({ postures }), [postures]);
  const aggregate = useMemo(() => aggregatePostureScore(rings), [rings]);
  return (
    <article className="hud-panel hud-compliance" style={{ minHeight: height }}>
      <header className="hud-panel-header">
        <span className="dash-kicker">POSTURE // COMPLIANCE</span>
        <h3>Compliance posture</h3>
        <div className="hud-aggregate">
          <strong>{aggregate}</strong><em>%</em>
          <small>aggregate score</small>
        </div>
      </header>
      <ul className="hud-compliance-grid">
        {rings.map((r) => (
          <li key={r.framework} className={`compliance-ring status-${r.status}`}>
            <ComplianceRingSvg ring={r} />
            <strong className="compliance-label">{r.label}</strong>
            <small className="compliance-meta">
              {r.controlsCovered}/{r.controlsTotal} · {r.scanner}
            </small>
            {r.trendDelta !== 0 && (
              <em className={`compliance-trend ${r.trendDelta > 0 ? 'is-up' : 'is-down'}`}>
                {r.trendDelta > 0 ? '▲' : '▼'} {Math.abs(r.trendDelta)}
              </em>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ComplianceRingSvg({ ring }: { ring: CompliancePostureRing }) {
  const SIZE = 72;
  const STROKE = 5;
  const r1 = SIZE / 2 - STROKE - 1;
  const r2 = SIZE / 2 - STROKE * 2 - 4;
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  const fill1 = (ring.coveragePercent / 100) * c1;
  const trendPct = Math.max(0, Math.min(100, ring.coveragePercent + ring.trendDelta));
  const fill2 = (trendPct / 100) * c2;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="compliance-ring-svg">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r1} className="ring-track" strokeWidth={STROKE} />
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r2} className="ring-track ring-track-inner" strokeWidth={STROKE - 1} />
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r1} className="ring-fill ring-fill-current" strokeWidth={STROKE}
              strokeDasharray={`${fill1} ${c1}`} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
      <circle cx={SIZE / 2} cy={SIZE / 2} r={r2} className="ring-fill ring-fill-trend" strokeWidth={STROKE - 1}
              strokeDasharray={`${fill2} ${c2}`} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
      <text x={SIZE / 2} y={SIZE / 2 + 4} className="ring-readout">{ring.coveragePercent}</text>
    </svg>
  );
}

/* ============================================================
   2. Fast-Path Lane Status
   ============================================================ */

interface FastPathLaneStatusProps {
  lanes: EnvironmentSnapshot['fastPathLanes'];
  height?: number;
}

export function FastPathLaneStatus({ lanes, height = 220 }: FastPathLaneStatusProps) {
  const views = useMemo(() => projectFastPathLanes(lanes), [lanes]);
  const totalIops = useMemo(() => totalLaneIops(views), [views]);
  const drops = useMemo(() => lanesInDrop(views), [views]);
  return (
    <article className="hud-panel hud-fastpath" style={{ minHeight: height }}>
      <header className="hud-panel-header">
        <span className="dash-kicker">FABRIC // FAST PATH</span>
        <h3>Data-plane lane status</h3>
        <div className="hud-aggregate">
          <strong>{(totalIops / 1000).toFixed(0)}</strong><em>K iops</em>
          <small className={drops > 0 ? 'has-drops' : ''}>{drops} dropping</small>
        </div>
      </header>
      <ul className="hud-fastpath-grid">
        {views.map((lane) => (
          <li key={lane.id} className={`fastpath-lane status-${lane.status}`}>
            <LaneArcSvg lane={lane} />
            <strong className="lane-label">{lane.label}</strong>
            <small className="lane-meta">
              {(lane.iops / 1000).toFixed(0)}K · q{lane.queueDepth}/{Math.round(lane.queueFill * 100)}%
              {lane.drops > 0 && <span className="lane-drops">⚠ {lane.drops} drop</span>}
            </small>
          </li>
        ))}
      </ul>
    </article>
  );
}

function LaneArcSvg({ lane }: { lane: FastPathLaneView }) {
  const SIZE = 76;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 8;
  const segCount = lane.segmentCount;
  // Span 270° for a chunky gauge (12 segments across 270°, leaving a 90°
  // gap at the bottom).
  const TOTAL_SWEEP = 270;
  const SEG_SWEEP = TOTAL_SWEEP / segCount;
  const START = -135; // start at top-left
  const segments = [];
  for (let i = 0; i < segCount; i += 1) {
    const a0 = START + i * SEG_SWEEP + 1;
    const a1 = START + (i + 1) * SEG_SWEEP - 1;
    let kind: 'lit' | 'warning' | 'critical' | 'idle' = 'idle';
    if (i < lane.segmentsCritical) kind = 'critical';
    else if (i < lane.segmentsCritical + lane.segmentsWarning) kind = 'warning';
    else if (i < lane.segmentsLit) kind = 'lit';
    segments.push({ key: `s-${i}`, a0, a1, kind });
  }
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="lane-arc-svg">
      {segments.map((s) => (
        <path key={s.key} className={`lane-seg lane-seg-${s.kind}`} d={arcPath(cx, cy, radius, s.a0, s.a1)} />
      ))}
      <text x={cx} y={cy + 4} className="lane-readout">{Math.round(lane.queueFill * 100)}</text>
    </svg>
  );
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(startDeg + 90, 1); // adapter — polar starts at north
  const end = polarToCartesian(endDeg + 90, 1);
  const x0 = cx + start.x * r;
  const y0 = cy + start.y * r;
  const x1 = cx + end.x * r;
  const y1 = cy + end.y * r;
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* ============================================================
   3. SLO Burn-Rate Gauges
   ============================================================ */

interface SloBurnGaugesProps {
  samples: EnvironmentSnapshot['serviceSamples'];
  /** Optional historical buffers for multi-window burn. The mock telemetry
   *  doesn't keep history, so the widget falls back to the current sample. */
  shortWindow?: EnvironmentSnapshot['serviceSamples'][];
  longWindow?: EnvironmentSnapshot['serviceSamples'][];
  height?: number;
}

export function SloBurnGauges({ samples, shortWindow = [], longWindow = [], height = 220 }: SloBurnGaugesProps) {
  const views = useMemo(() => projectAllBurnRates(samples, shortWindow, longWindow), [samples, shortWindow, longWindow]);
  const pageCount = views.filter((v) => v.severity === 'page' || v.severity === 'critical').length;
  // Maintain a small per-service rolling history of the burn rate so we
  // can show a 24-tick sparkline below each gauge — fills the lower half
  // of the panel with real signal instead of leaving it empty.
  const historiesRef = useRef<Record<string, number[]>>({});
  const histories = historiesRef.current;
  for (const v of views) {
    const arr = histories[v.serviceId] ?? [];
    arr.push(v.burnRate5m);
    if (arr.length > 24) arr.shift();
    histories[v.serviceId] = arr;
  }
  return (
    <article className="hud-panel hud-slo" style={{ minHeight: height }}>
      <header className="hud-panel-header">
        <span className="dash-kicker">SLO // BURN RATE</span>
        <h3>Error-budget burn</h3>
        <div className="hud-aggregate">
          <strong>{pageCount}</strong>
          <small>{pageCount === 1 ? 'service paging' : 'services paging'}</small>
        </div>
      </header>
      <ul className="hud-slo-grid">
        {views.map((v) => (
          <li key={v.serviceId} className={`burn-gauge sev-${v.severity}`}>
            <BurnGaugeSvg view={v} />
            <strong className="burn-label">{v.label}</strong>
            <small className="burn-meta">
              {v.requestsPerSec.toLocaleString()} rps · {(v.budgetRemaining * 100).toFixed(0)}% bdg
            </small>
            <BurnSparkline series={histories[v.serviceId] ?? []} severity={v.severity} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function BurnSparkline({ series, severity }: { series: number[]; severity: BurnRateView['severity'] }) {
  if (series.length === 0) return null;
  const W = 96;
  const H = 22;
  const max = Math.max(1.4, ...series);
  const dx = W / Math.max(1, series.length - 1);
  const points = series.map((v, i) => `${(i * dx).toFixed(1)},${(H - (v / max) * (H - 2) - 1).toFixed(1)}`).join(' ');
  // 1.0 burn-rate threshold guideline
  const thresholdY = H - (1.0 / max) * (H - 2) - 1;
  return (
    <svg className={`burn-spark sev-${severity}`} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <line x1={0} y1={thresholdY} x2={W} y2={thresholdY} className="burn-spark-threshold" />
      <polyline points={points} className="burn-spark-line" />
    </svg>
  );
}

function BurnGaugeSvg({ view }: { view: BurnRateView }) {
  const SIZE = 76;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rOuter = SIZE / 2 - 6;
  const rInner = SIZE / 2 - 14;
  // Cap visual fills at 1.4x burn (= "critical" threshold). Beyond that,
  // ring is fully filled and the colour ramp does the alerting.
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;
  const fillOuter = Math.min(1.4, view.burnRate5m) / 1.4 * cOuter;
  const fillInner = Math.min(1.4, view.burnRate1h) / 1.4 * cInner;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="burn-gauge-svg">
      <circle cx={cx} cy={cy} r={rOuter} className="burn-track" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={rInner} className="burn-track" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={rOuter} className="burn-fill burn-fill-5m" strokeWidth={4}
              strokeDasharray={`${fillOuter} ${cOuter}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={rInner} className="burn-fill burn-fill-1h" strokeWidth={3}
              strokeDasharray={`${fillInner} ${cInner}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 1} className="burn-readout">×{view.burnRate5m.toFixed(1)}</text>
      <text x={cx} y={cy + 9} className="burn-readout-sub">5m</text>
    </svg>
  );
}

/* ============================================================
   4. Deception Radar
   ============================================================ */

interface DeceptionRadarProps {
  alerts: Alert[];
  endpoints: Endpoint[];
  /** Used to rotate the sweep continuously regardless of incoming pings. */
  tickSeed?: number;
  height?: number;
}

export function DeceptionRadar({ alerts, endpoints, tickSeed = 0, height = 220 }: DeceptionRadarProps) {
  const pings = useMemo(() => projectDeceptionRadar({ alerts, endpoints }), [alerts, endpoints]);
  const sweepAngle = (tickSeed * 11) % 360;

  // Static outpost markers — every monitored endpoint sits here as a
  // permanent radar contact, with edge / honeypot endpoints rendered
  // brighter than ordinary hosts. Plotted at fixed bearings spread evenly
  // around the dial so the radar reads as 'watching' even when no pings
  // have fired.
  const outposts = useMemo(() => {
    const candidates = endpoints.slice(0, 8);
    return candidates.map((ep, i) => {
      const bearing = (i * (360 / Math.max(1, candidates.length))) % 360;
      const isHoneypot = ep.kind === 'edge' || ep.sensors.includes('opencanary');
      return {
        id: ep.id,
        bearing,
        range: isHoneypot ? 0.7 : 0.45,
        isHoneypot,
      };
    });
  }, [endpoints]);
  const honeypotCount = outposts.filter((o) => o.isHoneypot).length;

  return (
    <article className="hud-panel hud-deception" style={{ minHeight: height }}>
      <header className="hud-panel-header">
        <span className="dash-kicker">DECEPTION // RADAR</span>
        <h3>Honeypot touches</h3>
        <div className="hud-aggregate">
          <strong>{pings.length}</strong>
          <small>active pings</small>
        </div>
      </header>
      <div className="deception-radar-wrap">
        <DeceptionRadarSvg pings={pings} sweepAngle={sweepAngle} outposts={outposts} />
      </div>
      <ul className="deception-events">
        {pings.slice(0, 4).map((p) => (
          <li key={p.id} className={`deception-event sev-${p.severity}`}>
            <strong>{p.sourceIp}</strong>
            <span>{p.service.toUpperCase()}</span>
            <em>→ {p.endpointId}</em>
          </li>
        ))}
        {pings.length === 0 && (
          <>
            <li className="deception-event deception-event-static">
              <strong>{honeypotCount} honeypots</strong>
              <span>{outposts.length} OUTPOSTS</span>
              <em>STANDING WATCH</em>
            </li>
            <li className="deception-event-empty">No active pings · sweep idle</li>
          </>
        )}
      </ul>
    </article>
  );
}

function DeceptionRadarSvg({ pings, sweepAngle, outposts }: { pings: DeceptionPing[]; sweepAngle: number; outposts: { id: string; bearing: number; range: number; isHoneypot: boolean }[] }) {
  const SIZE = 200;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE / 2 - 8;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" className="deception-radar-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="radarBg">
          <stop offset="0%" stopColor="rgba(78, 200, 255, 0.16)" />
          <stop offset="80%" stopColor="rgba(78, 200, 255, 0.04)" />
          <stop offset="100%" stopColor="rgba(78, 200, 255, 0)" />
        </radialGradient>
        <linearGradient id="radarSweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(78, 200, 255, 0)" />
          <stop offset="80%" stopColor="rgba(78, 200, 255, 0.35)" />
          <stop offset="100%" stopColor="rgba(78, 200, 255, 0.85)" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#radarBg)" />
      {[0.33, 0.66, 1.0].map((rr) => (
        <circle key={`r-${rr}`} cx={cx} cy={cy} r={R * rr} className="radar-ring" />
      ))}
      {[0, 45, 90, 135].map((deg) => {
        const a = polarToCartesian(deg, 1);
        const b = polarToCartesian(deg + 180, 1);
        return (
          <line
            key={`s-${deg}`}
            className="radar-spoke"
            x1={cx + a.x * R}
            y1={cy + a.y * R}
            x2={cx + b.x * R}
            y2={cy + b.y * R}
          />
        );
      })}
      {/* Sweep wedge — rotates with tickSeed */}
      <g transform={`rotate(${sweepAngle} ${cx} ${cy})`}>
        <path
          d={`M ${cx} ${cy} L ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx + Math.cos((-60 - 90) * Math.PI / 180) * R} ${cy + Math.sin((-60 - 90) * Math.PI / 180) * R} Z`}
          fill="url(#radarSweep)"
          opacity={0.9}
        />
      </g>
      {/* Static outpost markers — always visible, faint, so the radar reads
          as 'watching' even when no pings have fired. */}
      {outposts.map((o) => {
        const cart = polarToCartesian(o.bearing, o.range);
        return (
          <g
            key={`outpost-${o.id}`}
            className={`radar-outpost ${o.isHoneypot ? 'is-honeypot' : 'is-asset'}`}
            transform={`translate(${cx + cart.x * R} ${cy + cart.y * R})`}
          >
            <circle r={o.isHoneypot ? 4.5 : 3} className="outpost-ring" />
            <circle r={o.isHoneypot ? 1.8 : 1.2} className="outpost-core" />
          </g>
        );
      })}
      {/* Pings */}
      {pings.map((p) => {
        const cart = polarToCartesian(p.bearing, p.range);
        return (
          <g key={p.id} className={`radar-ping sev-${p.severity}`} transform={`translate(${cx + cart.x * R} ${cy + cart.y * R})`}>
            <circle r={6} className="ping-glow" />
            <circle r={2.4} className="ping-core" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={3} className="radar-centre" />
    </svg>
  );
}

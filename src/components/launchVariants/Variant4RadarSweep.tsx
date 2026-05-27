/**
 * Variant 4 — Radar Sweep.
 *
 * Layout: polar radar centerpiece with sweep wedge + outpost markers, one
 * for each boot system. As each system finishes loading its outpost
 * brightens. LEFT panel is a compact loading list; RIGHT panel is a
 * fast-scrolling network-style packet log.
 */

import { useEffect, useRef } from 'react';
import type { BootLogLine, BootSystem } from '../../lib/launchBootFeed';
import type { LaunchFeed } from './useLaunchFeed';
import {
  BlinkingCursor,
  BracketCorners,
  ChevronRing,
  CoordReadout,
  CountUpNumber,
  MicroDotGrid,
  SegmentRing,
  TickingMarker,
} from './LaunchHudPrimitives';

interface Props { feed: LaunchFeed; }

export function Variant4RadarSweep({ feed }: Props) {
  return (
    <section className="lv lv4" aria-label="Launch — Radar Sweep">
      <header className="lv-header lv4-header">
        <div className="lv-wordmark">
          <h1>HARVESTER<BlinkingCursor /></h1>
          <span>
            NEXUS · RADAR SWEEP · {feed.readyCount}/{feed.totalCount} contacts · <CoordReadout seed={feed.readyCount * 7} />
          </span>
        </div>
        <div className="lv-percent-meter">
          <span className="lv-percent-label">SWEEP</span>
          <span className="lv-percent-value">
            <CountUpNumber target={Math.round(feed.progress * 100)} />%
          </span>
        </div>
      </header>

      <div className="lv4-grid">
        <aside className="lv4-list">
          <h2 className="lv-zone-title">CONTACTS // BOOT</h2>
          <ul className="lv4-contact-list">
            {feed.systems.map((s, i) => (
              <li key={s.id} className={`lv4-contact phase-${s.phase}`}>
                <span className="lv4-contact-bearing">{((i / feed.systems.length) * 360).toFixed(0).padStart(3, '0')}°</span>
                <span className="lv4-contact-label">{s.label}</span>
                <span className="lv4-contact-pct">{Math.round(s.progress * 100)}%</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="lv4-centre">
          <RadarSweep feed={feed} />
        </div>

        <aside className="lv4-log">
          <h2 className="lv-zone-title">PACKET STREAM // {feed.logLines.length}<BlinkingCursor /></h2>
          <PacketLog lines={feed.logLines} />
          <div className="lv-corner-dots"><MicroDotGrid cols={24} rows={3} /></div>
        </aside>
      </div>

      <footer className="lv-loading-bar lv4-bar">
        <span style={{ width: `${feed.progress * 100}%` }} />
      </footer>
    </section>
  );
}

function RadarSweep({ feed }: { feed: LaunchFeed }) {
  const SIZE = 380;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = SIZE / 2 - 12;
  const sweepAngle = (feed.elapsedMs / 1100) * 360 % 360;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="lv4-svg" aria-hidden>
      <defs>
        <radialGradient id="lv4Bg">
          <stop offset="0%" stopColor="rgba(0, 255, 153, 0.16)" />
          <stop offset="80%" stopColor="rgba(0, 255, 153, 0.04)" />
          <stop offset="100%" stopColor="rgba(0, 255, 153, 0)" />
        </radialGradient>
        <linearGradient id="lv4Sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0, 255, 153, 0)" />
          <stop offset="80%" stopColor="rgba(0, 255, 153, 0.45)" />
          <stop offset="100%" stopColor="rgba(0, 255, 153, 0.95)" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#lv4Bg)" />
      {[0.25, 0.5, 0.75, 1.0].map((rr) => (
        <circle key={`r-${rr}`} cx={cx} cy={cy} r={R * rr} className="lv4-ring" />
      ))}
      {[0, 30, 60, 90, 120, 150].map((deg) => {
        const a = (deg - 90) * (Math.PI / 180);
        return (
          <line
            key={`s-${deg}`}
            x1={cx - Math.cos(a) * R}
            y1={cy - Math.sin(a) * R}
            x2={cx + Math.cos(a) * R}
            y2={cy + Math.sin(a) * R}
            className="lv4-spoke"
          />
        );
      })}
      {/* sweep wedge */}
      <g transform={`rotate(${sweepAngle} ${cx} ${cy})`}>
        <path
          d={`M ${cx} ${cy} L ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx + Math.cos((-90 + 50) * Math.PI / 180) * R} ${cy + Math.sin((-90 + 50) * Math.PI / 180) * R} Z`}
          fill="url(#lv4Sweep)"
        />
      </g>
      {/* outposts — one per boot system */}
      {feed.systems.map((s, i) => {
        const bearing = (i / feed.systems.length) * 360;
        const a = (bearing - 90) * (Math.PI / 180);
        // Range grows as the system loads — newly-active systems sit
        // toward the rim; ready systems clamp at 0.95 of the outer ring.
        const range = 0.25 + s.progress * 0.7;
        const x = cx + Math.cos(a) * R * range;
        const y = cy + Math.sin(a) * R * range;
        return (
          <g key={s.id} transform={`translate(${x} ${y})`} className={`lv4-outpost phase-${s.phase}`}>
            <circle r={s.phase === 'ready' ? 5.5 : 3.8} className="lv4-outpost-glow" />
            <circle r={s.phase === 'ready' ? 2.6 : 1.6} className="lv4-outpost-core" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={4} className="lv4-centre-dot" />
      <text x={cx} y={cy - 24} className="lv4-readout">{Math.round(feed.progress * 100)}%</text>
      <text x={cx} y={cy + 8} className="lv4-readout-sub">SWEEP / SCAN</text>
      {/* Segmented progress ring around the centre — matches Variants 1/3 */}
      <SegmentRing cx={cx} cy={cy} r={32} segments={36} lit={Math.round(feed.progress * 36)} thickness={3} startAngle={-90} />
      {/* Chevron ring at the rim — indicates sweep direction */}
      <ChevronRing cx={cx} cy={cy} r={R - 12} segments={32} direction="cw" spin="var(--lv-spin-slow)" delayMs={520} />
      {/* Ticking marker that snaps around the perimeter */}
      <TickingMarker cx={cx} cy={cy} r={R + 4} steps={48} stepDurationMs={90} size={4} />
      {/* Corner brackets framing the stage */}
      <BracketCorners x={8} y={8} width={SIZE - 16} height={SIZE - 16} size={14} />
    </svg>
  );
}

function PacketLog({ lines }: { lines: BootLogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="lv-log lv4-log-body" ref={ref}>
      {lines.map((line, i) => (
        <div key={line.id} className={`lv-log-line lv-log-${line.level}`}>
          <span className="lv-log-pkt">PKT-{(i % 999).toString(16).padStart(3, '0').toUpperCase()}</span>
          <span className="lv-log-time">{(line.timestampMs / 1000).toFixed(3)}</span>
          <span className="lv-log-source">{line.source}</span>
          <span className="lv-log-message">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

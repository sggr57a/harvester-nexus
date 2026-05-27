/**
 * Variant 1 — Concentric Boot.
 *
 * Layout: thin LEFT rail of system status rows (with mini per-row progress
 * bars), big CENTRE composition of 5 concentric SVG rings rotating at
 * different speeds with a central percentage readout, and a RIGHT panel
 * of fast-scrolling boot-log lines. Loading bar across the bottom.
 */

import { useEffect, useRef } from 'react';
import type { LaunchFeed } from './useLaunchFeed';
import {
  BlinkingCursor,
  BracketCorners,
  ChevronRing,
  CoordReadout,
  CountUpNumber,
  MicroDotGrid,
  ScanLine,
  SegmentRing,
  TickingMarker,
} from './LaunchHudPrimitives';

interface Props { feed: LaunchFeed; }

export function Variant1ConcentricBoot({ feed }: Props) {
  return (
    <section className="lv lv1" aria-label="Launch — Concentric Boot">
      <header className="lv-header">
        <div className="lv-wordmark">
          <h1>HARVESTER<BlinkingCursor /></h1>
          <span>NEXUS · BOOT PHASE · <CoordReadout seed={feed.systems.length} /></span>
        </div>
        <div className="lv-percent-meter">
          <span className="lv-percent-label">SYNCING HUD</span>
          <span className="lv-percent-value">
            <CountUpNumber target={Math.round(feed.progress * 100)} />%
          </span>
        </div>
      </header>

      <div className="lv1-grid">
        <aside className="lv-leftrail">
          <h2 className="lv-zone-title">SYSTEM CHECKS // {feed.readyCount} / {feed.totalCount}</h2>
          <ul className="lv-system-list lv-system-list-compact">
            {feed.systems.map((s) => (
              <li key={s.id} className={`lv-system-row phase-${s.phase}`}>
                <span className="lv-system-marker" aria-hidden />
                <span className="lv-system-label">{s.label}</span>
                <span className="lv-system-bar">
                  <span style={{ width: `${s.progress * 100}%` }} />
                  {s.phase === 'loading' && <ScanLine durationMs={1100} />}
                </span>
                <span className="lv-system-pct">{Math.round(s.progress * 100)}</span>
              </li>
            ))}
          </ul>
          <div className="lv-corner-dots"><MicroDotGrid cols={20} rows={4} /></div>
        </aside>

        <div className="lv-centre">
          <ConcentricRings progress={feed.progress} />
          <div className="lv-centre-caption">SYS // BOOT-LOCK<BlinkingCursor /></div>
        </div>

        <aside className="lv-rightlog">
          <h2 className="lv-zone-title">BOOT FEED // KERNEL + K8S + XDR</h2>
          <ScrollingLog lines={feed.logLines} />
          <div className="lv-corner-dots"><MicroDotGrid cols={20} rows={3} /></div>
        </aside>
      </div>

      <footer className="lv-loading-bar">
        <span style={{ width: `${feed.progress * 100}%` }} />
      </footer>
    </section>
  );
}


function ConcentricRings({ progress }: { progress: number }) {
  const SIZE = 380;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  // Every ring uses one of THREE standardised speeds (slow / mid / fast)
  // and one of FOUR standardised opacity buckets (track / low / mid /
  // high) — pulled from the unified design tokens in launchVariants.css.
  // Stroke-widths are fixed to thin / mid / thick.
  const RINGS = [
    { r: 170, stroke: 'var(--lv-stroke-thin)',  dash: '2 6',   spin: 'var(--lv-spin-slow)', dir:  1, opacity: 'var(--lv-op-low)',  drawLength: 1100, delay:  280 },
    { r: 144, stroke: 'var(--lv-stroke-thin)',  dash: '4 12',  spin: 'var(--lv-spin-slow)', dir: -1, opacity: 'var(--lv-op-mid)',  drawLength:  920, delay:  340 },
    { r: 118, stroke: 'var(--lv-stroke-mid)',   dash: '12 8',  spin: 'var(--lv-spin-mid)',  dir:  1, opacity: 'var(--lv-op-mid)',  drawLength:  760, delay:  400 },
    { r:  92, stroke: 'var(--lv-stroke-thin)',  dash: '0',     spin: 'var(--lv-spin-mid)',  dir: -1, opacity: 'var(--lv-op-low)',  drawLength:  600, delay:  460 },
    { r:  64, stroke: 'var(--lv-stroke-thick)', dash: '24 6',  spin: 'var(--lv-spin-fast)', dir:  1, opacity: 'var(--lv-op-high)', drawLength:  440, delay:  520 },
  ];

  const progressRing = 2 * Math.PI * 38;
  const progressArc = progressRing * progress;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="lv1-rings" aria-hidden>
      {RINGS.map((R, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R.r}
          fill="none"
          className="lv1-ring"
          stroke="currentColor"
          strokeDasharray={R.dash}
          style={{
            ['--lv1-spin' as string]: R.spin,
            ['--lv1-delay' as string]: `${R.delay}ms`,
            ['--lv-draw-length' as string]: String(R.drawLength),
            strokeWidth: R.stroke,
            strokeOpacity: R.opacity,
            animationDirection: R.dir < 0 ? 'normal, reverse' : 'normal, normal',
            transformOrigin: `${cx}px ${cy}px`,
          }}
        />
      ))}
      {/* tick markers at the cardinal points */}
      {[0, 90, 180, 270].map((deg) => {
        const a = (deg - 90) * (Math.PI / 180);
        const x1 = cx + Math.cos(a) * 188;
        const y1 = cy + Math.sin(a) * 188;
        const x2 = cx + Math.cos(a) * 200;
        const y2 = cy + Math.sin(a) * 200;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.4} className="lv1-tick" />;
      })}
      {/* chevron ring — indicates spin direction visually */}
      <ChevronRing cx={cx} cy={cy} r={180} segments={32} direction="cw" spin="var(--lv-spin-slow)" delayMs={520} />
      {/* segmented progress around the centre — 36 segments, lit proportional to progress */}
      <SegmentRing cx={cx} cy={cy} r={52} segments={36} lit={Math.round(progress * 36)} thickness={3} startAngle={-90} />
      {/* centre progress arc */}
      <circle cx={cx} cy={cy} r={38} className="lv1-progress-track" />
      <circle
        cx={cx}
        cy={cy}
        r={38}
        className="lv1-progress-arc"
        strokeDasharray={`${progressArc} ${progressRing}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 2} className="lv1-progress-readout">
        {Math.round(progress * 100)}
      </text>
      <text x={cx} y={cy + 16} className="lv1-progress-sub">
        BOOT %
      </text>
      {/* ticking outer marker (snaps to discrete bearings) */}
      <TickingMarker cx={cx} cy={cy} r={200} steps={48} stepDurationMs={90} size={4} />
      {/* corner targeting brackets framing the whole stage */}
      <BracketCorners x={8} y={8} width={SIZE - 16} height={SIZE - 16} size={14} />
    </svg>
  );
}

function ScrollingLog({ lines }: { lines: import('../../lib/launchBootFeed').BootLogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="lv-log" ref={ref}>
      {lines.map((line) => (
        <div key={line.id} className={`lv-log-line lv-log-${line.level}`}>
          <span className="lv-log-time">{(line.timestampMs / 1000).toFixed(3)}</span>
          <span className="lv-log-source">[{line.source.padEnd(10).slice(0, 10)}]</span>
          <span className="lv-log-message">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Variant 3 — Hex Grid.
 *
 * Layout: a hexagonal centerpiece composed of nested hexes + a spiral of
 * hex-cells that illuminate as the boot progresses. LEFT panel shows the
 * boot-system tree as a nested indented list with sub-tasks; RIGHT panel
 * is a high-density mono log with character-flicker effect.
 */

import { useEffect, useRef } from 'react';
import type { BootLogLine } from '../../lib/launchBootFeed';
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

export function Variant3HexGrid({ feed }: Props) {
  return (
    <section className="lv lv3" aria-label="Launch — Hex Grid">
      <header className="lv-header lv3-header">
        <div className="lv-wordmark">
          <h1>HARVESTER<BlinkingCursor /></h1>
          <span>NEXUS · HEX MATRIX · BOOT · <CoordReadout seed={feed.readyCount * 3} /></span>
        </div>
        <div className="lv-percent-meter">
          <span className="lv-percent-label">SYS-LOCK</span>
          <span className="lv-percent-value">
            <CountUpNumber target={Math.round(feed.progress * 100)} />%
          </span>
        </div>
      </header>

      <div className="lv3-grid">
        <aside className="lv3-tree">
          <h2 className="lv-zone-title">SUBSYSTEM TREE // {feed.readyCount}/{feed.totalCount}</h2>
          <ul className="lv3-treelist">
            {feed.systems.map((s) => (
              <li key={s.id} className={`lv3-tree-item phase-${s.phase}`}>
                <span className="lv3-tree-marker" aria-hidden>{s.phase === 'ready' ? '◆' : s.phase === 'loading' ? '◇' : '·'}</span>
                <span className="lv3-tree-label">{s.label}</span>
                <span className="lv3-tree-detail">{s.detail}</span>
                <span className="lv3-tree-pct">{Math.round(s.progress * 100)}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="lv3-centre">
          <HexCenterpiece progress={feed.progress} />
          <div className="lv3-coords">
            <span>// 13°36'8.93" N</span>
            <span>// 02h 18m :: tick {Math.floor(feed.elapsedMs / 80)}</span>
            <span>// PHASE-LOCK<BlinkingCursor /></span>
          </div>
          <div className="lv-corner-dots"><MicroDotGrid cols={28} rows={2} /></div>
        </div>

        <aside className="lv3-log">
          <h2 className="lv-zone-title">DIAGNOSTIC // RAW</h2>
          <FlickerLog lines={feed.logLines} />
          <div className="lv-corner-dots"><MicroDotGrid cols={22} rows={3} /></div>
        </aside>
      </div>

      <footer className="lv-loading-bar lv3-bar">
        <span style={{ width: `${feed.progress * 100}%` }} />
      </footer>
    </section>
  );
}

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i * 60 - 30) * (Math.PI / 180);
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

function HexCenterpiece({ progress }: { progress: number }) {
  const SIZE = 360;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  // Nested hexagons + a ring of small hex satellites that illuminate as
  // progress grows.
  const SATELLITES = 12;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="lv3-svg" aria-hidden>
      {[160, 130, 100, 70].map((r, i) => (
        <path key={r} d={hexPath(cx, cy, r)} className={`lv3-hex lv3-hex-${i}`} />
      ))}
      {Array.from({ length: SATELLITES }).map((_, i) => {
        const angle = (i / SATELLITES) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * 178;
        const y = cy + Math.sin(angle) * 178;
        const lit = (i / SATELLITES) < progress;
        return (
          <path
            key={`sat-${i}`}
            d={hexPath(x, y, 8)}
            className={`lv3-sat ${lit ? 'lv3-sat-lit' : ''}`}
          />
        );
      })}
      {/* Segmented progress ring around the core (matches Variant 1 vocab) */}
      <SegmentRing cx={cx} cy={cy} r={48} segments={36} lit={Math.round(progress * 36)} thickness={3} startAngle={-90} />
      <circle cx={cx} cy={cy} r={32} className="lv3-core" />
      <text x={cx} y={cy + 4} className="lv3-readout">{Math.round(progress * 100)}%</text>
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const a = (deg - 90) * (Math.PI / 180);
        return (
          <line
            key={deg}
            x1={cx + Math.cos(a) * 34}
            y1={cy + Math.sin(a) * 34}
            x2={cx + Math.cos(a) * 64}
            y2={cy + Math.sin(a) * 64}
            className="lv3-spoke"
          />
        );
      })}
      {/* Chevron ring outside the largest hex */}
      <ChevronRing cx={cx} cy={cy} r={172} segments={28} direction="cw" spin="var(--lv-spin-slow)" delayMs={520} />
      {/* Ticking marker that snaps around the perimeter */}
      <TickingMarker cx={cx} cy={cy} r={188} steps={48} stepDurationMs={90} size={4} />
      {/* Corner brackets framing the stage */}
      <BracketCorners x={8} y={8} width={SIZE - 16} height={SIZE - 16} size={14} />
    </svg>
  );
}

const FLICKER_CHARS = '01░▒▓█│┤┐└┘┌#@%&';

function FlickerLog({ lines }: { lines: BootLogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="lv-log lv3-log-body" ref={ref}>
      <div className="lv3-flicker-strip">
        {Array.from({ length: 64 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${(i * 70) % 1300}ms` }}>
            {FLICKER_CHARS[i % FLICKER_CHARS.length]}
          </span>
        ))}
      </div>
      {lines.map((line) => (
        <div key={line.id} className={`lv-log-line lv-log-${line.level}`}>
          <span className="lv-log-time">{(line.timestampMs / 1000).toFixed(2)}</span>
          <span className="lv-log-source">[{line.source.padEnd(10).slice(0, 10)}]</span>
          <span className="lv-log-message">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

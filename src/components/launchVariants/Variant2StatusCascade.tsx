/**
 * Variant 2 — Status Cascade.
 *
 * Pure left/right split with no centerpiece. Designed for pure information
 * density — every pixel reads as data. The LEFT half is a rich status
 * cascade where each system row shows a horizontal segmented progress bar,
 * mini-spinner, and live status detail. The RIGHT half is a 3-column
 * fast-scrolling log: timestamp · source · message.
 */

import { useEffect, useRef } from 'react';
import type { BootLogLine, BootSystem } from '../../lib/launchBootFeed';
import type { LaunchFeed } from './useLaunchFeed';
import { BlinkingCursor, CoordReadout, CountUpNumber, MicroDotGrid, ScanLine } from './LaunchHudPrimitives';

interface Props { feed: LaunchFeed; }

export function Variant2StatusCascade({ feed }: Props) {
  return (
    <section className="lv lv2" aria-label="Launch — Status Cascade">
      <header className="lv-header lv2-header">
        <div className="lv-wordmark">
          <h1>HARVESTER<BlinkingCursor /></h1>
          <span>
            NEXUS · STATUS CASCADE · {feed.readyCount} / {feed.totalCount} · <CoordReadout seed={feed.readyCount} />
          </span>
        </div>
        <div className="lv-loading-bar lv2-bar">
          <span style={{ width: `${feed.progress * 100}%` }} />
          <ScanLine durationMs={1500} />
          <em><CountUpNumber target={Math.round(feed.progress * 100)} />%</em>
        </div>
      </header>

      <div className="lv2-grid">
        <aside className="lv2-status">
          <header className="lv-zone-title">SYSTEM CASCADE</header>
          <ul className="lv-system-list lv2-system-list">
            {feed.systems.map((s, idx) => <Lv2Row key={s.id} system={s} index={idx} />)}
          </ul>
          <div className="lv-corner-dots"><MicroDotGrid cols={24} rows={3} /></div>
        </aside>

        <aside className="lv2-log">
          <header className="lv-zone-title">BOOT FEED // {feed.logLines.length} entries<BlinkingCursor /></header>
          <Lv2Log lines={feed.logLines} />
          <div className="lv-corner-dots"><MicroDotGrid cols={24} rows={3} /></div>
        </aside>
      </div>
    </section>
  );
}

function Lv2Row({ system, index }: { system: BootSystem; index: number }) {
  const SEG = 28;
  const lit = Math.round(system.progress * SEG);
  return (
    <li className={`lv2-row phase-${system.phase}`} style={{ animationDelay: `${index * 30}ms` }}>
      <span className="lv2-row-id">{(index + 1).toString(16).padStart(2, '0').toUpperCase()}</span>
      <span className="lv2-row-label">{system.label}</span>
      <span className="lv2-row-detail">{system.detail}</span>
      <span className="lv2-row-bar">
        {Array.from({ length: SEG }).map((_, i) => (
          <i key={i} className={i < lit ? 'lit' : ''} />
        ))}
      </span>
      <span className="lv2-row-pct">{Math.round(system.progress * 100).toString().padStart(3, ' ')}</span>
      <span className="lv2-row-status">{system.phase === 'ready' ? '✓' : system.phase === 'loading' ? '·' : '·'}</span>
    </li>
  );
}

function Lv2Log({ lines }: { lines: BootLogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="lv-log lv2-log-body" ref={ref}>
      {lines.map((line) => (
        <div key={line.id} className={`lv-log-line lv-log-${line.level}`}>
          <span className="lv-log-time">{(line.timestampMs / 1000).toFixed(4)}</span>
          <span className="lv-log-source">[{line.source.padEnd(10).slice(0, 10)}]</span>
          <span className="lv-log-message">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  buildLaunchSequence,
  launchDataBlock,
  type LaunchCallout,
} from '../lib/launchSequence';

const launchSequence = buildLaunchSequence();

/** Animated launch screen that shows after login but before the cockpit
 *  loads. The progress bar is the only piece kept from the original
 *  layout — the rest is now a HUD callout system in the futuristic
 *  technical-readout style. Each callout is a chamfered SVG frame with
 *  a lead-line + end-cap glyph that connects toward the central
 *  wordmark + data block, giving the screen the 'systems coming
 *  online around you' feel.
 */
export function LaunchSequence() {
  // Small ticking counter so the central data block feels alive.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 110);
    return () => window.clearInterval(id);
  }, []);

  const data = launchDataBlock(tick);

  return (
    <section className="launch-sequence" aria-label="Nexus interface loading sequence">
      <div className="launch-grid" />
      <div className="launch-scanlines" />

      <div className="launch-wordmark-group">
        <div className="launch-wordmark">HARVESTER</div>
        <div className="launch-subwordmark">NEXUS</div>
        <div className="launch-wordmark-sub">// boot phase · synthesising HUD</div>
      </div>

      <div className="launch-meter-shell">
        <div className="launch-meter">
          <span />
        </div>
        <div className="launch-meter-labels">
          <span>00</span>
          <strong>loading interface</strong>
          <span>100</span>
        </div>
      </div>

      <div className="launch-data-block" aria-hidden>
        <header>
          <span className="ldb-kicker">SYS // BOOT FEED</span>
          <span className="ldb-status">{data.status}</span>
        </header>
        <ul className="ldb-grid">
          {data.columns.map((c) => (
            <li key={c.label}>
              <span className="ldb-label">{c.label}</span>
              <span className="ldb-value">{c.value}</span>
            </li>
          ))}
        </ul>
        <footer>
          <span className="ldb-tick">tick // {String(tick).padStart(4, '0')}</span>
          <span className="ldb-pulse" />
        </footer>
      </div>

      <div className="launch-callouts" aria-hidden>
        {launchSequence.callouts.map((c) => (
          <CalloutFrame key={c.id} callout={c} />
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   CalloutFrame — chamfered SVG card + lead-line + end-cap glyph
   ============================================================ */

const CALLOUT_WIDTH = 280;
const CALLOUT_HEIGHT = 130;
const CHAMFER = 14;

const ENDCAP_SVG: Record<LaunchCallout['endcap'], JSX.Element> = {
  reticle: (
    <g className="endcap endcap-reticle">
      <circle r="9" className="endcap-ring" />
      <circle r="3" className="endcap-core" />
      <line x1="-14" y1="0" x2="-12" y2="0" />
      <line x1="14" y1="0" x2="12" y2="0" />
      <line x1="0" y1="-14" x2="0" y2="-12" />
      <line x1="0" y1="14" x2="0" y2="12" />
    </g>
  ),
  plus: (
    <g className="endcap endcap-plus">
      <circle r="8" className="endcap-ring" />
      <line x1="-5" y1="0" x2="5" y2="0" />
      <line x1="0" y1="-5" x2="0" y2="5" />
    </g>
  ),
  warning: (
    <g className="endcap endcap-warning">
      <polygon points="0,-9 8,7 -8,7" className="endcap-tri" />
      <line x1="0" y1="-3" x2="0" y2="3" />
      <circle cx="0" cy="5" r="0.8" />
    </g>
  ),
  dot: (
    <g className="endcap endcap-dot">
      <circle r="6" className="endcap-ring" />
      <circle r="2.4" className="endcap-core" />
    </g>
  ),
  crosshair: (
    <g className="endcap endcap-crosshair">
      <circle r="11" className="endcap-ring" />
      <circle r="5" className="endcap-ring endcap-ring-inner" />
      <line x1="-16" y1="0" x2="-7" y2="0" />
      <line x1="16" y1="0" x2="7" y2="0" />
      <line x1="0" y1="-16" x2="0" y2="-7" />
      <line x1="0" y1="16" x2="0" y2="7" />
      <circle r="1.4" className="endcap-core" />
    </g>
  ),
};

function CalloutFrame({ callout }: { callout: LaunchCallout }) {
  const isRight = callout.anchor.endsWith('right');
  const isTop = callout.anchor.startsWith('top');
  const w = CALLOUT_WIDTH;
  const h = CALLOUT_HEIGHT;
  const c = CHAMFER;

  // Chamfered rectangle path. Two chamfered corners on the side facing the
  // centre of the screen, two square corners on the outer side, so the
  // frame visually points toward the wordmark.
  const path = isRight
    ? `M 0 0 L ${w - c} 0 L ${w} ${c} L ${w} ${h - c} L ${w - c} ${h} L 0 ${h} Z`
    : `M ${c} 0 L ${w} 0 L ${w} ${h} L ${c} ${h} L 0 ${h - c} L 0 ${c} Z`;

  // Lead-line that runs from the inside corner of the frame toward a target
  // point inside the screen. The end-cap glyph is rendered at the target.
  const leadStart = isRight
    ? { x: 0, y: isTop ? h - 10 : 10 }
    : { x: w, y: isTop ? h - 10 : 10 };
  const leadMid = isRight
    ? { x: -32, y: isTop ? h + 18 : -18 }
    : { x: w + 32, y: isTop ? h + 18 : -18 };
  const leadEnd = isRight
    ? { x: -88, y: isTop ? h + 18 : -18 }
    : { x: w + 88, y: isTop ? h + 18 : -18 };

  const flowClass = `callout-frame anchor-${callout.anchor} endcap-kind-${callout.endcap}`;
  const animDelay = `${callout.delayMs}ms`;

  return (
    <article className={flowClass} style={{ animationDelay: animDelay }}>
      <svg
        viewBox={`-100 -32 ${w + 200} ${h + 64}`}
        width={w + 200}
        height={h + 64}
        className="callout-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* lead-line + end-cap, drawn first so the frame sits on top */}
        <g className="callout-lead" style={{ animationDelay: animDelay }}>
          <polyline
            points={`${leadStart.x},${leadStart.y} ${leadMid.x},${leadMid.y} ${leadEnd.x},${leadEnd.y}`}
            className="lead-line"
          />
          <g transform={`translate(${leadEnd.x} ${leadEnd.y})`}>
            {ENDCAP_SVG[callout.endcap]}
          </g>
        </g>

        {/* frame fill + stroke + scanline overlay */}
        <path d={path} className="callout-fill" />
        <path d={path} className="callout-stroke" />
        {/* corner accent ticks on the outside corners */}
        {isRight ? (
          <>
            <line x1="2" y1="0" x2="10" y2="0" className="callout-tick" />
            <line x1="0" y1="2" x2="0" y2="10" className="callout-tick" />
            <line x1="2" y1={h} x2="10" y2={h} className="callout-tick" />
            <line x1="0" y1={h - 2} x2="0" y2={h - 10} className="callout-tick" />
          </>
        ) : (
          <>
            <line x1={w - 2} y1="0" x2={w - 10} y2="0" className="callout-tick" />
            <line x1={w} y1="2" x2={w} y2="10" className="callout-tick" />
            <line x1={w - 2} y1={h} x2={w - 10} y2={h} className="callout-tick" />
            <line x1={w} y1={h - 2} x2={w} y2={h - 10} className="callout-tick" />
          </>
        )}
        {/* internal divider line below the kicker */}
        <line x1={isRight ? c : 14} y1="22" x2={isRight ? w - 8 : w - c} y2="22" className="callout-divider" />
      </svg>

      <div className="callout-content" style={{ animationDelay: animDelay }}>
        <header>
          <span className="callout-kicker">{callout.kicker}</span>
          <strong className="callout-headline">{callout.headline}</strong>
        </header>
        <ul className="callout-lines">
          {callout.lines.map((line, idx) => (
            <li key={`${callout.id}-${idx}`} style={{ animationDelay: `${callout.delayMs + 200 + idx * 90}ms` }}>
              <span className="line-bullet">▸</span>
              <span className="line-text">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

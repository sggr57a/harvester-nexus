import type { CSSProperties } from 'react';
import { buildHudTelemetry } from '../lib/hudTelemetry';
import { getTheme, THEME_CATALOG, type ThemeId } from '../lib/themes';
import { useLiveTelemetry } from '../lib/liveTelemetry';
import { AdvancedVisualizationGrid } from './dashboards/AdvancedViz';

const telemetry = buildHudTelemetry();
const linePoints = telemetry.lineSeries
  .map((value, index) => `${(index / (telemetry.lineSeries.length - 1)) * 100},${100 - value}`)
  .join(' ');

function buildWidgetPoints(samples: number[]): string {
  return samples
    .map((value, index) => `${(index / Math.max(1, samples.length - 1)) * 100},${100 - value}`)
    .join(' ');
}

interface HudDashboardProps {
  activeTheme: ThemeId;
}

export function HudDashboard({ activeTheme }: HudDashboardProps) {
  const activeThemeDefinition = getTheme(activeTheme);
  const liveSnapshot = useLiveTelemetry(1600);

  return (
    <section className="hud-dashboard" aria-label="Animated Nexus cluster dashboard mockup">
      <div className="hud-scanlines" />
      <div className="hud-orb hud-orb-left" />
      <div className="hud-orb hud-orb-right" />
      <div className="banner-corner banner-corner-tl" />
      <div className="banner-corner banner-corner-tr" />
      <div className="banner-corner banner-corner-bl" />
      <div className="banner-corner banner-corner-br" />
      <div className="banner-lab-crosshair" />
      <div className="banner-micro-labels" aria-hidden="true">
        {telemetry.microLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="hud-hero hud-panel">
        <div>
          <span className="hud-kicker">NEXUS // HARVESTER CONTROL</span>
          <h2>Live cluster command surface</h2>
          <p>
            Animated telemetry mockup for validation, apply readiness, storage health, service mesh, and multi-cluster targeting.
          </p>
        </div>
        <div className="hud-status-pill">
          <span className="hud-live-dot" />
          DEMO STREAM ACTIVE
        </div>
      </div>

      <div className="hud-reference-controls hud-panel">
        <nav className="hud-segment-menu hud-drawn-menu" aria-label="HUD dashboard menu modes">
          {telemetry.navigationTabs.map((tab, index) => (
            <button className={tab.active ? 'is-selected' : ''} key={tab.id} type="button" style={{ animationDelay: `${index * 120}ms` }}>
              <span>{tab.signal}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <label className="hud-select-shell">
          <span>Target cluster</span>
          <select value="edge-a-vcluster" onChange={() => undefined}>
            <option value="edge-a-vcluster">edge-a / vcluster</option>
            <option value="edge-b-vcluster">edge-b / vcluster</option>
            <option value="control-plane">control-plane</option>
          </select>
        </label>
      </div>

      <div className="hud-theme-sync hud-panel" aria-label="Active visual theme profile">
        <div>
          <span className="hud-kicker">THEME // MOCKUP STYLE</span>
          <strong>{activeThemeDefinition.name}</strong>
          <p>{activeThemeDefinition.visualStyle}</p>
        </div>
        <div className="hud-theme-cards">
          {THEME_CATALOG.map((theme) => (
            <span className={theme.id === activeTheme ? 'hud-theme-card is-active' : 'hud-theme-card'} key={theme.id}>
              <i style={{ background: `linear-gradient(135deg, ${theme.swatches.join(', ')})` }} />
              <b>{theme.name}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="hud-widget-drawer hud-panel">
        {telemetry.graphWidgets.map((widget, index) => {
          const peak = Math.max(...widget.samples);
          const average = Math.round(widget.samples.reduce((sum, sample) => sum + sample, 0) / widget.samples.length);
          const widgetPoints = buildWidgetPoints(widget.samples);

          return (
            <article className={`hud-drawn-widget widget-${widget.renderMode}`} key={widget.label} style={{ animationDelay: `${widget.drawDelayMs}ms` }}>
              <div className="hud-widget-chrome" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="hud-panel-title">
                <span>{widget.renderMode}</span>
                <strong>{widget.label}</strong>
              </div>
              <div className="hud-widget-readout">
                <b>{peak}</b>
                <span>peak</span>
                <em>{average} avg</em>
              </div>
              {widget.renderMode === 'line' && (
                <svg className="hud-widget-scope" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`${widget.label.replace(/\s+/g, '-')}-gradient`} x1="0%" x2="100%">
                      <stop offset="0%" stopColor="var(--theme-good)" />
                      <stop offset="100%" stopColor="var(--theme-accent)" />
                    </linearGradient>
                  </defs>
                  <path d="M0 100 L100 100 L100 0" />
                  <polyline points={widgetPoints} />
                  {widget.samples.map((sample, sampleIndex) => (
                    <circle
                      key={`${widget.label}-node-${sampleIndex}`}
                      cx={(sampleIndex / Math.max(1, widget.samples.length - 1)) * 100}
                      cy={100 - sample}
                      r="1.9"
                    />
                  ))}
                </svg>
              )}
              {widget.renderMode === 'bars' && (
                <div className="hud-widget-graph hud-widget-segments">
                  {widget.samples.map((sample, sampleIndex) => (
                    <span key={`${widget.label}-${sampleIndex}`} style={{ '--sample': `${sample}%`, animationDelay: `${(index + sampleIndex) * 45}ms` } as CSSProperties} />
                  ))}
                </div>
              )}
              {widget.renderMode === 'radial' && (
                <div className="hud-widget-radials">
                  {widget.samples.slice(0, 6).map((sample, sampleIndex) => (
                    <span
                      key={`${widget.label}-radial-${sampleIndex}`}
                      style={{
                        '--sample-deg': `${sample * 3.6}deg`,
                        animationDelay: `${(index + sampleIndex) * 70}ms`,
                      } as CSSProperties}
                    >
                      <i>{sample}</i>
                    </span>
                  ))}
                </div>
              )}
              {widget.renderMode === 'matrix' && (
                <div className="hud-widget-matrix">
                  {widget.samples.map((sample, sampleIndex) => (
                    <i className={sample ? 'is-lit' : ''} key={`${widget.label}-${sampleIndex}`} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="hud-control-surfaces hud-panel" aria-label="Animated expandable dashboard controls">
        {telemetry.controlSurfaces.map((surface, index) => (
          <details className={`hud-fold-control fold-${surface.animation}`} key={surface.label} open={index < 2}>
            <summary>
              <span>{surface.animation}</span>
              <strong>{surface.label}</strong>
            </summary>
            <div>
              {surface.options.map((option, optionIndex) => (
                <button className={option.active ? 'is-selected' : ''} key={option.label} type="button" style={{ animationDelay: `${(index + optionIndex) * 80}ms` }}>
                  <span>{option.signal}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>

      <div className="banner-lab-strip hud-panel">
        <div className="banner-status-rails">
          {telemetry.statusRails.map((rail) => (
            <div className="banner-status-rail" key={rail.label}>
              <span>{rail.label}</span>
              <i><b style={{ width: `${rail.value}%` }} /></i>
              <strong>{rail.value}</strong>
            </div>
          ))}
        </div>
        <div className="banner-radio-matrix">
          {telemetry.radioGroups.map((group) => (
            <fieldset key={group.label}>
              <legend>{group.label}</legend>
              <div>
                {group.options.map((option) => (
                  <label className={option.active ? 'banner-radio is-active' : 'banner-radio'} key={option.label}>
                    <input type="radio" checked={option.active} readOnly />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <div className="hud-metric-grid">
        {telemetry.metrics.map((metric) => (
          <article className={`hud-panel hud-metric hud-status-${metric.status}`} key={metric.label}>
            <div className="hud-metric-header">
              <span>{metric.label}</span>
              <strong>{metric.trend}</strong>
            </div>
            <div className="hud-metric-value">
              {metric.value}
              <span>{metric.unit}</span>
            </div>
            <div className="hud-meter" aria-hidden="true">
              <span style={{ width: `${metric.value}%` }} />
            </div>
          </article>
        ))}
      </div>

      <div className="hud-visual-grid">
        <article className="hud-panel hud-radar">
          <div className="hud-panel-title">
            <span>Topology pulse</span>
            <strong>4 nodes</strong>
          </div>
          <div className="hud-radar-map">
            <div className="hud-radar-ring ring-one" />
            <div className="hud-radar-ring ring-two" />
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <polyline points="50,20 22,58 50,82 78,58 50,20" />
              <line x1="22" y1="58" x2="78" y2="58" />
              <line x1="50" y1="20" x2="50" y2="82" />
            </svg>
            {telemetry.nodes.map((node) => (
              <span
                className={`hud-node hud-node-${node.status}`}
                key={node.id}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
              >
                <i />
                <b>{node.label}</b>
              </span>
            ))}
          </div>
        </article>

        <article className="hud-panel hud-storage">
          <div className="hud-panel-title">
            <span>CSI storage rings</span>
            <strong>green path</strong>
          </div>
          <div className="hud-rings">
            {telemetry.storageRings.map((ring) => (
              <div className="hud-ring" key={ring.label} style={{ '--ring-value': `${ring.value * 3.6}deg` } as CSSProperties}>
                <div className="hud-ring-core">
                  <strong>{ring.value}%</strong>
                  <span>{ring.label}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="hud-panel hud-throughput">
          <div className="hud-panel-title">
            <span>Manifest apply wave</span>
            <strong>live preview</strong>
          </div>
          <div className="hud-bars">
            {telemetry.throughputBars.map((bar, index) => (
              <span key={`${bar}-${index}`} style={{ height: `${bar}%`, animationDelay: `${index * 90}ms` }} />
            ))}
          </div>
          <div className="hud-data-ribbon">
            <span>validate</span>
            <span>dry-run</span>
            <span>diff</span>
            <span>apply</span>
          </div>
        </article>

        <article className="hud-panel hud-waveform">
          <div className="hud-panel-title">
            <span>Resource waveform</span>
            <strong>sync trace</strong>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="hudWaveGradient" x1="0%" x2="100%">
                <stop offset="0%" stopColor="#33f7ff" />
                <stop offset="100%" stopColor="#75ff6a" />
              </linearGradient>
            </defs>
            <polyline points={linePoints} />
            {telemetry.lineSeries.map((value, index) => (
              <circle
                key={`${value}-${index}`}
                cx={(index / (telemetry.lineSeries.length - 1)) * 100}
                cy={100 - value}
                r="1.7"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </svg>
        </article>

        <article className="hud-panel hud-toggle-bank">
          <div className="hud-panel-title">
            <span>Control toggles</span>
            <strong>armed</strong>
          </div>
          <div className="hud-toggle-grid">
            {telemetry.toggles.map((toggle) => (
              <div className={toggle.enabled ? 'hud-toggle is-on' : 'hud-toggle'} key={toggle.label}>
                <span>{toggle.label}</span>
                <i />
              </div>
            ))}
          </div>
        </article>

        <article className="hud-panel hud-feed">
          <div className="hud-panel-title">
            <span>Event stream</span>
            <strong>5 signals</strong>
          </div>
          <ul>
            {telemetry.eventFeed.map((event) => (
              <li key={event}>
                <span />
                {event}
              </li>
            ))}
          </ul>
        </article>

        <article className="hud-panel banner-scan-stack">
          <div className="hud-panel-title">
            <span>Scan windows</span>
            <strong>lab feed</strong>
          </div>
          {telemetry.scanPanels.map((panel) => (
            <div className="banner-scan-card" key={panel.label}>
              <div className="banner-scan-visual">
                <span />
                <i />
              </div>
              <div>
                <strong>{panel.label}</strong>
                <code>{panel.value}</code>
                <div className="banner-mini-bars">
                  {panel.bars.map((bar, index) => (
                    <b key={`${panel.label}-${bar}-${index}`} style={{ width: `${bar}%` }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </article>
      </div>

      <AdvancedVisualizationGrid telemetry={liveSnapshot} />
    </section>
  );
}

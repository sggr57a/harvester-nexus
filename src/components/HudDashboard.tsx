import { useMemo, type CSSProperties } from 'react';
import { buildHudTelemetry } from '../lib/hudTelemetry';
import { getTheme, THEME_CATALOG, type ThemeId } from '../lib/themes';

const telemetry = buildHudTelemetry();

function generateSmoothSeries(base: number[], multiplier: number, offset: number): number[] {
  const expanded: number[] = [];
  for (let i = 0; i < base.length - 1; i++) {
    const a = base[i] * multiplier + offset;
    const b = base[i + 1] * multiplier + offset;
    expanded.push(a);
    expanded.push(a + (b - a) * 0.33);
    expanded.push(a + (b - a) * 0.66);
  }
  expanded.push(base[base.length - 1] * multiplier + offset);
  return expanded.map((v) => Math.max(2, Math.min(98, v)));
}

function buildPolyline(series: number[], width = 100, height = 100): string {
  return series
    .map((v, i) => `${(i / (series.length - 1)) * width},${height - v}`)
    .join(' ');
}

function buildAreaPath(series: number[], width = 100, height = 100): string {
  const points = series.map((v, i) => `${(i / (series.length - 1)) * width},${height - v}`);
  return `M0,${height} L${points.join(' L')} L${width},${height} Z`;
}

function generateDenseSpectrum(count: number, seed: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = seed[i % seed.length];
    const variation = Math.sin(i * 0.4) * 15 + Math.sin(i * 1.2) * 8 + Math.cos(i * 0.7) * 12;
    out.push(Math.max(4, Math.min(96, base + variation)));
  }
  return out;
}

const ch1 = generateSmoothSeries(telemetry.lineSeries, 0.9, 5);
const ch2 = generateSmoothSeries(telemetry.lineSeries, 0.7, -12);
const ch3 = generateSmoothSeries(telemetry.throughputBars, 0.8, 8);
const denseSpectrum = generateDenseSpectrum(64, telemetry.throughputBars);

const linePoints = buildPolyline(ch1);
const ch2Points = buildPolyline(ch2);
const ch3Points = buildPolyline(ch3);
const areaPath1 = buildAreaPath(ch1);
const areaPath2 = buildAreaPath(ch2);

function buildWidgetPoints(samples: number[]): string {
  return samples
    .map((value, index) => `${(index / Math.max(1, samples.length - 1)) * 100},${100 - value}`)
    .join(' ');
}

interface HudDashboardProps {
  activeTheme?: ThemeId;
}

export function HudDashboard({ activeTheme }: HudDashboardProps) {
  const resolvedTheme = activeTheme ?? 'route-grid';
  const activeThemeDefinition = getTheme(resolvedTheme);

  const widgetDenseSpectrums = useMemo(() => {
    return telemetry.graphWidgets.map((w) => generateDenseSpectrum(48, w.samples));
  }, []);

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
            <span className={theme.id === resolvedTheme ? 'hud-theme-card is-active' : 'hud-theme-card'} key={theme.id}>
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
          const denseSpec = widgetDenseSpectrums[index];

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
                <b className="hud-digital-readout">{peak}</b>
                <span>peak</span>
                <em>{average} avg</em>
              </div>
              {widget.renderMode === 'line' && (
                <svg className="hud-widget-scope" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`${widget.label.replace(/\s+/g, '-')}-fill-1`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id={`${widget.label.replace(/\s+/g, '-')}-fill-2`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--theme-accent-2)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={buildAreaPath(generateSmoothSeries(widget.samples, 0.9, 5))} fill={`url(#${widget.label.replace(/\s+/g, '-')}-fill-1)`} />
                  <path d={buildAreaPath(generateSmoothSeries(widget.samples, 0.7, -8))} fill={`url(#${widget.label.replace(/\s+/g, '-')}-fill-2)`} />
                  <polyline className="hud-trace hud-trace-2" points={buildPolyline(generateSmoothSeries(widget.samples, 0.7, -8))} />
                  <polyline className="hud-trace hud-trace-1" points={buildPolyline(generateSmoothSeries(widget.samples, 0.9, 5))} />
                  <polyline className="hud-trace hud-trace-3" points={buildPolyline(generateSmoothSeries(widget.samples, 0.5, 20))} />
                </svg>
              )}
              {widget.renderMode === 'bars' && (
                <div className="hud-widget-graph hud-widget-dense-spectrum">
                  {denseSpec.map((sample, sampleIndex) => (
                    <span key={sampleIndex} className="hud-spectrum-bar" style={{ '--sample': `${sample}%`, animationDelay: `${sampleIndex * 20}ms` } as CSSProperties} />
                  ))}
                </div>
              )}
              {widget.renderMode === 'radial' && (
                <div className="hud-widget-gauge-cluster">
                  {widget.samples.slice(0, 6).map((sample, sampleIndex) => (
                    <div
                      key={sampleIndex}
                      className="hud-arc-gauge"
                      style={{ '--gauge-value': `${sample * 1.8}deg` } as CSSProperties}
                    >
                      <svg viewBox="0 0 60 60" aria-hidden="true">
                        <circle className="hud-gauge-track" cx="30" cy="30" r="24" />
                        <circle className="hud-gauge-fill" cx="30" cy="30" r="24"
                          strokeDasharray={`${sample * 1.508} 150.8`}
                          transform="rotate(-90 30 30)" />
                        {Array.from({ length: 20 }).map((_, tick) => {
                          const angle = (tick / 20) * Math.PI * 2 - Math.PI / 2;
                          return (
                            <line key={tick}
                              x1={30 + Math.cos(angle) * 22}
                              y1={30 + Math.sin(angle) * 22}
                              x2={30 + Math.cos(angle) * (tick % 5 === 0 ? 18 : 20)}
                              y2={30 + Math.sin(angle) * (tick % 5 === 0 ? 18 : 20)}
                              className="hud-gauge-tick"
                            />
                          );
                        })}
                      </svg>
                      <span className="hud-gauge-value">{sample}</span>
                    </div>
                  ))}
                </div>
              )}
              {widget.renderMode === 'matrix' && (
                <div className="hud-widget-matrix">
                  {widget.samples.map((sample, sampleIndex) => (
                    <i className={sample ? 'is-lit' : ''} key={sampleIndex} />
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
            <div className="hud-metric-value hud-digital-readout">
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
            <span>Frequency spectrum</span>
            <strong className="hud-digital-readout">{Math.max(...denseSpectrum)}</strong>
          </div>
          <div className="hud-dense-bars">
            {denseSpectrum.map((bar, index) => (
              <span key={index} className="hud-dense-bar" style={{ height: `${bar}%`, animationDelay: `${index * 25}ms` } as CSSProperties} />
            ))}
          </div>
          <div className="hud-horizon-line" />
          <div className="hud-data-ribbon">
            <span>validate</span>
            <span>dry-run</span>
            <span>diff</span>
            <span>apply</span>
          </div>
        </article>

        <article className="hud-panel hud-waveform">
          <div className="hud-panel-title">
            <span>Multi-channel waveform</span>
            <strong className="hud-digital-readout">{telemetry.lineSeries[telemetry.lineSeries.length - 1]}</strong>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="hudWaveGradient1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hudWaveGradient2" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--theme-accent-2)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hudWaveGradient3" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--theme-good)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--theme-good)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="hud-wave-area hud-wave-area-1" d={areaPath1} fill="url(#hudWaveGradient1)" />
            <path className="hud-wave-area hud-wave-area-2" d={areaPath2} fill="url(#hudWaveGradient2)" />
            <polyline className="hud-wave-line hud-wave-ch3" points={ch3Points} />
            <polyline className="hud-wave-line hud-wave-ch2" points={ch2Points} />
            <polyline className="hud-wave-line hud-wave-ch1" points={linePoints} />
          </svg>
          <div className="hud-wave-legend">
            <span className="hud-legend-ch1">CH1</span>
            <span className="hud-legend-ch2">CH2</span>
            <span className="hud-legend-ch3">CH3</span>
          </div>
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

      <div className="hud-data-ticker" aria-hidden="true">
        <span>CPU_00: 82.4%</span>
        <span>IOPS: 128K</span>
        <span>NIC_RX: 4.2 Gb/s</span>
        <span>DRAM: 76.1%</span>
        <span>MESH_RT: 2.4ms</span>
        <span>CSI_QUEUE: 14</span>
        <span>MIGRATION: 3 active</span>
        <span>PODS: 284 running</span>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber, type EnvironmentSnapshot } from '../lib/liveTelemetry';
import { formatMetric } from '../lib/telemetry/environmentAdapter';
import type { TelemetryMode, TelemetryState } from '../lib/telemetry/mode';
import { hardwareTickerCells } from '../lib/telemetry/hardwareAddOn';
import { storageIopsTickerCells } from '../lib/telemetry/storageIops';

interface EnvironmentTickerProps {
  snapshot: EnvironmentSnapshot;
  telemetry?: TelemetryState;
  onTelemetryModeChange?: (mode: TelemetryMode) => void;
  /** Optional label shown above the cells; defaults to a generic "Live Environment" label */
  label?: string;
}

interface Cell {
  key: string;
  label: string;
  value: string;
  sub: string;
  delta?: number;
}

/**
 * Animated horizontal banner showing real-time aggregate statistics
 * of the mockup environment. Drops a "flash" CSS class on cells whose
 * value changed since the previous tick, so the user can see the
 * dashboards monitor a live environment.
 */
export function EnvironmentTicker({
  snapshot,
  telemetry,
  onTelemetryModeChange,
  label = 'Live Environment Stream',
}: EnvironmentTickerProps) {
  const previousTickRef = useRef<number>(snapshot.tick);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(() => new Set());

  const cells: Cell[] = useMemo(
    () => [
      {
        key: 'totalWorkloads',
        label: 'Workloads',
        value: formatNumber(snapshot.totalWorkloads),
        sub: 'vm·lxc·docker·pod',
        delta: snapshot.deltas.totalWorkloads,
      },
      {
        key: 'totalIops',
        label: 'Cluster IOPS',
        value: formatMetric(snapshot, 'totalIops', (v) => formatNumber(v, { compact: true })),
        sub: snapshot.storageIops?.source?.includes('diskstats')
          ? '/proc/diskstats'
          : snapshot.unavailableMetrics?.includes('totalIops')
            ? 'waiting for sample'
            : 'physical disks',
        delta: snapshot.deltas.totalIops,
      },
      ...storageIopsTickerCells(snapshot.storageIops),
      {
        key: 'ingressMbps',
        label: 'Ingress Mb/s',
        value: formatMetric(snapshot, 'ingressMbps', (v) => formatNumber(v)),
        sub: 'NIC bonds aggregated',
        delta: snapshot.deltas.ingressMbps,
      },
      {
        key: 'egressMbps',
        label: 'Egress Mb/s',
        value: formatMetric(snapshot, 'egressMbps', (v) => formatNumber(v)),
        sub: 'NIC bonds aggregated',
        delta: snapshot.deltas.egressMbps,
      },
      {
        key: 'cpuPercent',
        label: 'CPU %',
        value: formatMetric(snapshot, 'cpuPercent', (v) => `${v}%`),
        sub: 'rolling cluster avg',
        delta: snapshot.deltas.cpuPercent,
      },
      {
        key: 'ramPercent',
        label: 'DRAM %',
        value: formatMetric(snapshot, 'ramPercent', (v) => `${v}%`),
        sub: 'rolling cluster avg',
        delta: snapshot.deltas.ramPercent,
      },
      ...hardwareTickerCells(snapshot.accelerators),
      {
        key: 'watts',
        label: 'Power',
        value: formatMetric(snapshot, 'watts', (v) => `${formatNumber(v)} W`),
        sub: 'aggregate draw',
        delta: snapshot.deltas.watts,
      },
      {
        key: 'activeMigrations',
        label: 'Migrations',
        value: String(snapshot.activeMigrations),
        sub: 'in-flight vMotion',
        delta: snapshot.deltas.activeMigrations,
      },
      {
        key: 'openCves',
        label: 'Open CVEs',
        value: String(snapshot.openCves),
        sub: 'critical & high',
      },
      {
        key: 'trustScore',
        label: 'Trust',
        value: `${snapshot.trustScore}`,
        sub: 'security posture',
      },
    ],
    [snapshot],
  );

  useEffect(() => {
    if (snapshot.tick === previousTickRef.current) return;
    previousTickRef.current = snapshot.tick;
    const newFlash = new Set<string>();
    for (const cell of cells) {
      if (cell.delta && cell.delta !== 0) newFlash.add(cell.key as string);
    }
    setFlashKeys(newFlash);
    const handle = window.setTimeout(() => setFlashKeys(new Set()), 1100);
    return () => window.clearTimeout(handle);
  }, [snapshot.tick, cells]);

  const streamSub = telemetry?.mode === 'live'
    ? `tick #${snapshot.tick} · Harvester cluster metrics (pods, VMs, nodes)`
    : `tick #${snapshot.tick} · demo telemetry (synthetic)`;

  const modeLabel = telemetry?.mode === 'live' ? 'cluster live' : 'demo data';

  return (
    <div className="env-ticker" aria-label="Live environment statistics">
      <div className="env-ticker-cell" style={{ gridColumn: '1 / -1', background: 'transparent', border: 'none', padding: '0 0 0.2rem' }}>
        <span className="label" style={{ color: 'var(--theme-text-dim)' }}>{label}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span className="sub">{streamSub}{telemetry?.message ? ` · ${telemetry.message}` : ''}</span>
          <div className="env-ticker-mode-row">
            {onTelemetryModeChange ? (
              <select
                className="env-ticker-mode-select"
                aria-label="Telemetry mode"
                value={telemetry?.requested ?? 'auto'}
                onChange={(e) => onTelemetryModeChange(e.target.value as TelemetryMode)}
              >
                <option value="auto">Auto</option>
                <option value="live">Live</option>
                <option value="demo">Demo</option>
              </select>
            ) : null}
            <span className={`env-ticker-live env-ticker-live--${telemetry?.mode ?? 'demo'}`}>{modeLabel}</span>
          </div>
        </div>
      </div>
      {cells.map((cell) => {
        const deltaClass =
          cell.delta === undefined || cell.delta === 0
            ? ''
            : cell.delta > 0
              ? ' delta-up'
              : ' delta-down';
        const flashClass = flashKeys.has(cell.key as string) ? ' flash' : '';
        return (
          <div key={cell.key as string} className={`env-ticker-cell${deltaClass}${flashClass}`}>
            <span className="label">{cell.label}</span>
            <span className="value">{cell.value}</span>
            <span className="sub">
              {cell.sub}
              {cell.delta !== undefined && cell.delta !== 0 ? (
                <>
                  {' · '}
                  <strong style={{ color: cell.delta > 0 ? 'var(--theme-good)' : 'var(--theme-danger)' }}>
                    {cell.delta > 0 ? '+' : ''}
                    {formatNumber(cell.delta, { compact: true })}
                  </strong>
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Lightweight sidebar decoration: a glowing animated route line that follows
 * the theme. Adds visual cohesion between the sidebar and the dashboards.
 */
export function SidebarRouteDecoration() {
  return (
    <div className="sidebar-route-decoration" aria-hidden="true">
      <svg viewBox="0 0 200 36" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sidebar-route-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--theme-accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--theme-accent-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 18 Q 40 6, 80 18 T 160 18 L 200 14" fill="none" stroke="url(#sidebar-route-grad)" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="2.4" fill="var(--theme-accent)">
          <animateMotion dur="6s" repeatCount="indefinite" path="M0 18 Q 40 6, 80 18 T 160 18 L 200 14" />
        </circle>
      </svg>
    </div>
  );
}

export function useTickHook() {
  // Re-export for convenience to keep import surface narrow in App.tsx
  return null;
}

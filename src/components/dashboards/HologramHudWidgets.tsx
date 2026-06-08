import type { ReactNode } from 'react';
import { Sparkline } from './Widgets';

export function HudTile({
  label,
  className = '',
  children,
  burst,
  hero,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  burst?: boolean;
  hero?: boolean;
}) {
  return (
    <article className={`holo-tile ${className}${burst ? ' is-burst' : ''}${hero ? ' is-hero' : ''}`.trim()}>
      <span className="holo-tile-sheen" aria-hidden="true" />
      <span className="holo-tile-label">{label}</span>
      <div className="holo-tile-body">{children}</div>
    </article>
  );
}

export function HudEventStrip({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="holo-event-strip">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function HudLinearBar({
  label,
  value,
  max,
  tone = 'accent',
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'accent' | 'accent-2' | 'good' | 'warn' | 'danger';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="holo-linear-bar">
      <header>
        <span>{label}</span>
        <b>{max >= 1000 ? `${Math.round(value)}` : value.toFixed(max >= 100 ? 0 : 1)}</b>
      </header>
      <div className="holo-linear-track">
        <i className={`tone-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ConnectedColumnChart({
  bars,
  thermal = false,
  height = 110,
}: {
  bars: { label: string; value: number; max: number; format?: (v: number) => string }[];
  thermal?: boolean;
  height?: number;
}) {
  if (!bars.length) return null;
  const n = bars.length;
  const colW = 100 / n;

  return (
    <div className="holo-col-chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {thermal && (
            <linearGradient id="holo-thermal-col" x1="0" x2="0" y1="1" y2="0">
              <stop offset="0%" stopColor="var(--holo-thermal-cool)" />
              <stop offset="45%" stopColor="color-mix(in srgb, var(--holo-thermal-cool) 40%, var(--theme-warn) 60%)" />
              <stop offset="78%" stopColor="color-mix(in srgb, var(--theme-warn) 35%, var(--theme-danger) 65%)" />
              <stop offset="100%" stopColor="var(--theme-danger)" />
            </linearGradient>
          )}
        </defs>
        {bars.map((bar, i) => {
          const pct = Math.max(0, Math.min(1, bar.value / bar.max));
          const bh = pct * 72;
          const x = i * colW;
          const y = 88 - bh;
          const fill = thermal ? 'url(#holo-thermal-col)' : 'var(--theme-accent)';
          return (
            <g key={bar.label}>
              <rect x={x} y={y} width={colW - (i < n - 1 ? 0.4 : 0)} height={bh} fill={fill} opacity={thermal ? 1 : 0.85} />
              <rect x={x} y={y} width={colW - (i < n - 1 ? 0.4 : 0)} height={1.2} fill="#fff" opacity={0.85} />
              <text x={x + colW / 2} y={y - 2} textAnchor="middle" className="holo-col-value">
                {bar.format ? bar.format(bar.value) : Math.round(bar.value)}
              </text>
              <text x={x + colW / 2} y={96} textAnchor="middle" className="holo-col-label">
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HudNodeTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: { cells: string[]; hot?: boolean }[];
}) {
  return (
    <div className="holo-node-table-wrap">
      <table className="holo-node-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cells[0]} className={row.hot ? 'is-hot' : ''}>
              {row.cells.map((cell, idx) => (
                <td key={`${row.cells[0]}-${idx}`}>{idx === 0 ? cell : <b>{cell}</b>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HudWaveStrip({
  title,
  values,
  max,
  tone = 'accent',
}: {
  title: string;
  values: number[];
  max: number;
  tone?: 'accent' | 'accent-2' | 'warn' | 'danger';
}) {
  const normalized = values.map((v) => (v / max) * 100);
  return (
    <div className="holo-wave-strip">
      <header>{title}</header>
      <Sparkline values={normalized.length > 1 ? normalized : [40, 55, 48, 62]} height={180} />
      <div className="holo-wave-bars">
        {normalized.slice(-24).map((v, i) => (
          <i key={i} className={`tone-${tone}`} style={{ height: `${Math.max(4, v * 0.12)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function HudHistoryMatrix({
  rows,
}: {
  rows: { label: string; values: number[]; max: number; thermal?: boolean }[];
}) {
  return (
    <div className="holo-history-matrix">
      {rows.map((row) => {
        const vals = row.values.length ? row.values : [0];
        return (
          <div key={row.label} className="holo-history-row">
            <span>{row.label}</span>
            <div className="holo-history-bars">
              {vals.map((v, i) => {
                const pct = Math.max(4, (v / row.max) * 100);
                return (
                  <i
                    key={i}
                    className={row.thermal ? 'is-thermal' : ''}
                    style={{ height: `${pct}%` }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

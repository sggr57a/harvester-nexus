/**
 * Oscilloscope / FFT helpers that plot *measured* telemetry.
 *
 * Demo mode still animates because ``nextSnapshot`` perturbs cpu/ram/nic
 * each tick; these helpers never add Math.random() of their own, so a live
 * cluster cannot grow decorative noise on top of a real reading.
 */

import type { EnvironmentSnapshot } from '../liveTelemetry';

export type ScopeChannelId = 'cpu' | 'ram' | 'nic';

export interface ScopeChannelSpec {
  id: ScopeChannelId;
  label: string;
  unit: string;
  metric: 'cpuPercent' | 'ramPercent' | 'ingressMbps';
}

export const SCOPE_CHANNELS: ScopeChannelSpec[] = [
  { id: 'cpu', label: 'CPU', unit: '%', metric: 'cpuPercent' },
  { id: 'ram', label: 'DRAM', unit: '%', metric: 'ramPercent' },
  { id: 'nic', label: 'NIC RX', unit: '%', metric: 'ingressMbps' },
];

export function isSnapshotMetricAvailable(
  snapshot: EnvironmentSnapshot | undefined,
  key: string,
): boolean {
  if (!snapshot) return false;
  return !snapshot.unavailableMetrics?.includes(key);
}

/** Scale ingress Mbps into a 0–100 readout so it shares the scope with CPU/RAM. */
export function nicPercent(ingressMbps: number): number {
  if (!Number.isFinite(ingressMbps) || ingressMbps < 0) return 0;
  // 1 Gb/s full-scale keeps a quiet cluster readable without clipping a 10G NIC.
  return Math.max(0, Math.min(100, (ingressMbps / 1000) * 100));
}

export function channelValue(
  snapshot: EnvironmentSnapshot | undefined,
  spec: ScopeChannelSpec,
): number | null {
  if (!snapshot || !isSnapshotMetricAvailable(snapshot, spec.metric)) return null;
  const raw = snapshot[spec.metric];
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  return spec.id === 'nic' ? nicPercent(raw) : raw;
}

/**
 * Discrete Fourier transform magnitudes of a real series, DC-stripped and
 * scaled to 0–100. Deterministic: the same samples always produce the same bins.
 */
export function fftMagnitudes(samples: number[], bins: number): number[] {
  const n = samples.length;
  if (n === 0 || bins <= 0) return Array.from({ length: Math.max(0, bins) }, () => 0);
  const mean = samples.reduce((sum, value) => sum + value, 0) / n;
  const centered = samples.map((value) => value - mean);
  const nyquistBins = Math.max(1, Math.floor(n / 2));
  const out: number[] = [];
  for (let k = 1; k <= bins; k += 1) {
    const freqIndex = 1 + ((k - 1) / bins) * (nyquistBins - 1);
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * freqIndex * t) / n;
      re += centered[t] * Math.cos(angle);
      im += centered[t] * Math.sin(angle);
    }
    out.push(Math.sqrt(re * re + im * im) / n);
  }
  const peak = Math.max(...out, 1e-9);
  return out.map((value) => Math.max(0, Math.min(100, (value / peak) * 100)));
}

export function formatChannelReadout(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

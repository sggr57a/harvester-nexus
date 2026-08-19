import { describe, expect, it } from 'vitest';
import type { EnvironmentSnapshot } from '../liveTelemetry';
import {
  channelValue,
  fftMagnitudes,
  formatChannelReadout,
  nicPercent,
} from './scopeWaveform';

function snapshot(partial: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    totalWorkloads: 2,
    totalIops: 100,
    ingressMbps: 250,
    egressMbps: 80,
    cpuPercent: 41.5,
    ramPercent: 22,
    watts: 0,
    activeMigrations: 0,
    openCves: 0,
    trustScore: 0,
    unavailableMetrics: [],
    deltas: {
      totalWorkloads: 0,
      totalIops: 0,
      ingressMbps: 0,
      egressMbps: 0,
      cpuPercent: 0,
      ramPercent: 0,
      watts: 0,
      activeMigrations: 0,
    },
    tick: 4,
    ...partial,
  };
}

describe('scopeWaveform', () => {
  it('reads CPU / DRAM / NIC from the snapshot without inventing values', () => {
    const snap = snapshot();
    expect(channelValue(snap, { id: 'cpu', label: 'CPU', unit: '%', metric: 'cpuPercent' })).toBe(41.5);
    expect(channelValue(snap, { id: 'ram', label: 'DRAM', unit: '%', metric: 'ramPercent' })).toBe(22);
    expect(channelValue(snap, { id: 'nic', label: 'NIC RX', unit: '%', metric: 'ingressMbps' })).toBe(nicPercent(250));
  });

  it('returns null — not zero — when a metric is unavailable', () => {
    const snap = snapshot({ unavailableMetrics: ['cpuPercent'], cpuPercent: 0 });
    expect(channelValue(snap, { id: 'cpu', label: 'CPU', unit: '%', metric: 'cpuPercent' })).toBeNull();
    expect(formatChannelReadout(null)).toBe('—');
  });

  it('computes a deterministic FFT of the measured series', () => {
    const sine = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * i) / 16));
    const first = fftMagnitudes(sine, 16);
    const second = fftMagnitudes(sine, 16);
    expect(first).toEqual(second);
    expect(first.some((value) => value > 50)).toBe(true);
    expect(Math.max(...first)).toBeLessThanOrEqual(100);
  });
});

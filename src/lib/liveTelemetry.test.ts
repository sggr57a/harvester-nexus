import { describe, expect, it } from 'vitest';
import { formatNumber, nextSnapshot } from './liveTelemetry';

describe('nextSnapshot', () => {
  it('produces an initial snapshot with all required fields', () => {
    const snap = nextSnapshot();
    expect(snap.tick).toBe(1);
    expect(snap.totalWorkloads).toBeGreaterThanOrEqual(580);
    expect(snap.totalWorkloads).toBeLessThanOrEqual(720);
    expect(snap.totalIops).toBeGreaterThanOrEqual(880_000);
    expect(snap.totalIops).toBeLessThanOrEqual(1_400_000);
    expect(snap.cpuPercent).toBeGreaterThanOrEqual(38);
    expect(snap.cpuPercent).toBeLessThanOrEqual(86);
    expect(snap.deltas).toBeDefined();
  });

  it('advances tick and emits bounded deltas', () => {
    const first = nextSnapshot();
    const second = nextSnapshot(first);
    expect(second.tick).toBe(first.tick + 1);
    expect(Math.abs(second.deltas.cpuPercent)).toBeLessThanOrEqual(10);
    expect(Math.abs(second.deltas.activeMigrations)).toBeLessThanOrEqual(2);
    expect(second.totalIops).toBeGreaterThanOrEqual(880_000);
    expect(second.totalIops).toBeLessThanOrEqual(1_400_000);
  });

  it('keeps activeMigrations within sane bounds across many ticks', () => {
    let snap = nextSnapshot();
    for (let i = 0; i < 200; i += 1) {
      snap = nextSnapshot(snap);
      expect(snap.activeMigrations).toBeGreaterThanOrEqual(0);
      expect(snap.activeMigrations).toBeLessThanOrEqual(9);
    }
  });
});

describe('formatNumber', () => {
  it('formats large numbers as compact when requested', () => {
    expect(formatNumber(1_200_000, { compact: true })).toBe('1.20M');
    expect(formatNumber(82_500, { compact: true })).toBe('82.5K');
    expect(formatNumber(642, { compact: true })).toBe('642');
  });

  it('uses thousands separators by default', () => {
    expect(formatNumber(1_200_000)).toContain(',');
  });

  it('appends a suffix when provided', () => {
    expect(formatNumber(58, { suffix: '%' })).toBe('58%');
  });
});

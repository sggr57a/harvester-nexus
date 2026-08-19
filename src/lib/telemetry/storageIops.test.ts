import { describe, expect, it } from 'vitest';
import { formatMetric, payloadToEnvironmentSnapshot } from './environmentAdapter';
import { storageIopsTickerCells, storageIopsTotals, summarizeStorageIops } from './storageIops';
import type { EnvironmentTelemetryPayload } from './types';

function payload(overrides: Partial<EnvironmentTelemetryPayload> = {}): EnvironmentTelemetryPayload {
  return {
    totalWorkloads: 1,
    totalIops: 150,
    ingressMbps: 1,
    egressMbps: 1,
    cpuPercent: 10,
    ramPercent: 20,
    watts: 100,
    activeMigrations: 0,
    openCves: 0,
    trustScore: 80,
    tick: 1,
    source: 'mixed',
    clusterReady: true,
    monitoringEnabled: false,
    nodeCount: 1,
    podCount: 1,
    vmCount: 0,
    ...overrides,
  };
}

describe('summarizeStorageIops', () => {
  it('keeps measured disk IOPS and does not invent backend CSI rates', () => {
    const summary = summarizeStorageIops({
      totalIops: 150,
      readIops: 100,
      writeIops: 50,
      readMiBs: 12.4,
      writeMiBs: 6.2,
      devices: [
        { device: 'sda', iops: 150, readIops: 100, writeIops: 50, readMiBs: 12.4, writeMiBs: 6.2 },
      ],
      source: '/proc/diskstats',
    });
    expect(summary.totalIops).toBe(150);
    expect(summary.devices).toHaveLength(1);
    expect(summary.devices[0].device).toBe('sda');
  });

  it('keeps totals null when the host could not measure a rate yet', () => {
    const summary = summarizeStorageIops({
      totalIops: null,
      readIops: null,
      writeIops: null,
      readMiBs: null,
      writeMiBs: null,
      devices: [],
      source: 'unavailable (needs two samples)',
    });
    expect(summary.totalIops).toBeNull();
    expect(summary.devices).toEqual([]);
  });
});

describe('storageIopsTotals', () => {
  it('emits IOPS totals for hardware dashboards next to CPU/RAM', () => {
    const totals = storageIopsTotals({
      totalIops: 150.4,
      readIops: 100,
      writeIops: 50.4,
      readMiBs: 1.2,
      writeMiBs: 0.4,
      devices: [],
      source: '/proc/diskstats',
    });
    expect(totals).toEqual([
      { label: 'IOPS', value: '150' },
      { label: 'Read IOPS', value: '100' },
      { label: 'Write IOPS', value: '50' },
    ]);
  });

  it('renders dashes when storage IOPS has not been measured', () => {
    const totals = storageIopsTotals(undefined);
    expect(totals.map((row) => row.value)).toEqual(['—', '—', '—']);
  });
});

describe('storageIopsTickerCells', () => {
  it('splits measured read/write IOPS for the environment ticker', () => {
    const cells = storageIopsTickerCells({
      totalIops: 150,
      readIops: 100,
      writeIops: 50,
      readMiBs: 1.2,
      writeMiBs: 0.4,
      devices: [],
      source: '/proc/diskstats',
    });
    expect(cells.map((cell) => cell.label)).toEqual(['Read IOPS', 'Write IOPS']);
    expect(cells.map((cell) => cell.value)).toEqual(['100', '50']);
    expect(cells[0].sub).toBe('/proc/diskstats');
  });

  it('renders dashes while waiting for the second diskstats sample', () => {
    const cells = storageIopsTickerCells(undefined);
    expect(cells.map((cell) => cell.value)).toEqual(['—', '—']);
  });
});

describe('payloadToEnvironmentSnapshot · storage IOPS', () => {
  it('folds per-disk IOPS onto the same snapshot as CPU and DRAM', () => {
    const snap = payloadToEnvironmentSnapshot(
      payload({
        storageIops: {
          totalIops: 150,
          readIops: 100,
          writeIops: 50,
          readMiBs: 1.2,
          writeMiBs: 0.4,
          devices: [{ device: 'sda', iops: 150, readIops: 100, writeIops: 50, readMiBs: 1.2, writeMiBs: 0.4 }],
          source: '/proc/diskstats',
        },
      }),
    );
    expect(snap.storageIops?.totalIops).toBe(150);
    expect(snap.storageIops?.devices[0].device).toBe('sda');
    expect(snap.cpuPercent).toBe(10);
  });

  it('does not present a coerced 0 as measured cluster IOPS', () => {
    const snap = payloadToEnvironmentSnapshot(payload({ totalIops: null }));
    expect(formatMetric(snap, 'totalIops', (v) => String(v))).toBe('—');
  });
});


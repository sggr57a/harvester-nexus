import type { MaybeMetric } from './types';

export interface StorageDiskIops {
  device: string;
  iops: number;
  readIops: number;
  writeIops: number;
  readMiBs: number | null;
  writeMiBs: number | null;
}

export interface EnvironmentStorageIops {
  totalIops: MaybeMetric;
  readIops: MaybeMetric;
  writeIops: MaybeMetric;
  readMiBs: MaybeMetric;
  writeMiBs: MaybeMetric;
  devices: StorageDiskIops[];
  source?: string;
}

export interface StorageIopsTotal {
  label: string;
  value: string;
}

function fmt(value: MaybeMetric | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(Math.round(value));
}

export function summarizeStorageIops(
  input: EnvironmentStorageIops,
): EnvironmentStorageIops {
  return {
    totalIops: input.totalIops ?? null,
    readIops: input.readIops ?? null,
    writeIops: input.writeIops ?? null,
    readMiBs: input.readMiBs ?? null,
    writeMiBs: input.writeMiBs ?? null,
    devices: input.devices ?? [],
    source: input.source,
  };
}

export function emptyStorageIops(): EnvironmentStorageIops {
  return {
    totalIops: null,
    readIops: null,
    writeIops: null,
    readMiBs: null,
    writeMiBs: null,
    devices: [],
    source: 'unavailable',
  };
}

export function demoStorageIops(): EnvironmentStorageIops {
  return summarizeStorageIops({
    totalIops: 1_120_000,
    readIops: 640_000,
    writeIops: 480_000,
    readMiBs: 4820,
    writeMiBs: 3920,
    devices: [
      { device: 'nvme0n1', iops: 700_000, readIops: 400_000, writeIops: 300_000, readMiBs: 3010, writeMiBs: 2440 },
      { device: 'nvme1n1', iops: 420_000, readIops: 240_000, writeIops: 180_000, readMiBs: 1810, writeMiBs: 1480 },
    ],
    source: 'demo',
  });
}

export function formatDiskMetric(value: MaybeMetric | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

export function storageIopsTotals(
  summary: EnvironmentStorageIops | undefined,
): StorageIopsTotal[] {
  return [
    { label: 'IOPS', value: fmt(summary?.totalIops) },
    { label: 'Read IOPS', value: fmt(summary?.readIops) },
    { label: 'Write IOPS', value: fmt(summary?.writeIops) },
  ];
}

export interface StorageTickerCell {
  key: 'storageReadIops' | 'storageWriteIops';
  label: string;
  value: string;
  sub: string;
  delta?: number;
}

export function storageIopsTickerCells(
  summary: EnvironmentStorageIops | undefined,
): StorageTickerCell[] {
  const source = summary?.source?.includes('diskstats')
    ? '/proc/diskstats'
    : summary?.totalIops == null
      ? 'waiting for sample'
      : summary?.source || 'physical disks';
  return [
    {
      key: 'storageReadIops',
      label: 'Read IOPS',
      value: fmt(summary?.readIops),
      sub: source,
    },
    {
      key: 'storageWriteIops',
      label: 'Write IOPS',
      value: fmt(summary?.writeIops),
      sub: 'completed writes / s',
    },
  ];
}

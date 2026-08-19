import type { EnvironmentSnapshot } from '../liveTelemetry';

/** Zero baseline for live mode when cluster metrics are unavailable — no demo drift. */
export function emptyEnvironmentSnapshot(tick = 0): EnvironmentSnapshot {
  return {
    totalWorkloads: 0,
    totalIops: 0,
    ingressMbps: 0,
    egressMbps: 0,
    cpuPercent: 0,
    ramPercent: 0,
    watts: 0,
    activeMigrations: 0,
    openCves: 0,
    trustScore: 0,
    accelerators: {
      cards: 0,
      issues: 0,
      hottestC: null,
      byKind: {},
      waitingForHardware: [],
      devices: [],
    },
    storageIops: {
      totalIops: null,
      readIops: null,
      writeIops: null,
      readMiBs: null,
      writeMiBs: null,
      devices: [],
      source: 'unavailable',
    },
    unavailableMetrics: [
      'totalIops',
      'ingressMbps',
      'egressMbps',
      'cpuPercent',
      'ramPercent',
      'watts',
      'openCves',
      'trustScore',
    ],
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
    tick,
  };
}

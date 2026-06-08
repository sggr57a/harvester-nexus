import type { EnvironmentSnapshot } from '../liveTelemetry';
import type { EnvironmentTelemetryPayload } from './types';

const ZERO_DELTAS: EnvironmentSnapshot['deltas'] = {
  totalWorkloads: 0,
  totalIops: 0,
  ingressMbps: 0,
  egressMbps: 0,
  cpuPercent: 0,
  ramPercent: 0,
  watts: 0,
  activeMigrations: 0,
};

export function payloadToEnvironmentSnapshot(
  payload: EnvironmentTelemetryPayload,
  previous?: EnvironmentSnapshot,
): EnvironmentSnapshot {
  const base = {
    totalWorkloads: payload.totalWorkloads,
    totalIops: payload.totalIops,
    ingressMbps: payload.ingressMbps,
    egressMbps: payload.egressMbps,
    cpuPercent: payload.cpuPercent,
    ramPercent: payload.ramPercent,
    watts: payload.watts,
    activeMigrations: payload.activeMigrations,
    openCves: payload.openCves,
    trustScore: payload.trustScore,
    tick: payload.tick,
  };

  if (!previous) {
    return { ...base, deltas: { ...ZERO_DELTAS } };
  }

  return {
    ...base,
    deltas: {
      totalWorkloads: base.totalWorkloads - previous.totalWorkloads,
      totalIops: base.totalIops - previous.totalIops,
      ingressMbps: base.ingressMbps - previous.ingressMbps,
      egressMbps: base.egressMbps - previous.egressMbps,
      cpuPercent: base.cpuPercent - previous.cpuPercent,
      ramPercent: base.ramPercent - previous.ramPercent,
      watts: base.watts - previous.watts,
      activeMigrations: base.activeMigrations - previous.activeMigrations,
    },
  };
}

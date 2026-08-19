import type { EnvironmentSnapshot } from '../liveTelemetry';
import type { EnvironmentTelemetryPayload, MaybeMetric } from './types';

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

/** Metrics the BFF may report as null when the underlying source is absent. */
const NULLABLE_METRICS = [
  'totalIops',
  'ingressMbps',
  'egressMbps',
  'cpuPercent',
  'ramPercent',
  'watts',
  'openCves',
  'trustScore',
] as const satisfies readonly (keyof EnvironmentTelemetryPayload)[];

/**
 * Substitute 0 so downstream chart arithmetic stays total, while recording the
 * name so the UI can label it unavailable. Callers must never present a
 * coerced 0 as a measurement.
 */
function coerce(value: MaybeMetric, key: string, unavailable: string[]): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    unavailable.push(key);
    return 0;
  }
  return value;
}

export function payloadToEnvironmentSnapshot(
  payload: EnvironmentTelemetryPayload,
  previous?: EnvironmentSnapshot,
): EnvironmentSnapshot {
  const unavailableMetrics: string[] = [];
  const numeric = Object.fromEntries(
    NULLABLE_METRICS.map((key) => [key, coerce(payload[key], key, unavailableMetrics)]),
  ) as Record<(typeof NULLABLE_METRICS)[number], number>;

  const base = {
    totalWorkloads: payload.totalWorkloads,
    ...numeric,
    activeMigrations: payload.activeMigrations,
    tick: payload.tick,
    unavailableMetrics,
    metricSources: payload.metricSources,
    accelerators: payload.accelerators,
  };

  if (!previous) {
    return { ...base, deltas: { ...ZERO_DELTAS } };
  }

  // A metric that is unavailable now, or was unavailable last tick, has no
  // meaningful delta — reporting one would imply a measured change.
  const delta = (key: keyof EnvironmentSnapshot['deltas'], current: number, prior: number): number => {
    if (unavailableMetrics.includes(key) || previous.unavailableMetrics?.includes(key)) return 0;
    return current - prior;
  };

  return {
    ...base,
    deltas: {
      totalWorkloads: base.totalWorkloads - previous.totalWorkloads,
      totalIops: delta('totalIops', base.totalIops, previous.totalIops),
      ingressMbps: delta('ingressMbps', base.ingressMbps, previous.ingressMbps),
      egressMbps: delta('egressMbps', base.egressMbps, previous.egressMbps),
      cpuPercent: delta('cpuPercent', base.cpuPercent, previous.cpuPercent),
      ramPercent: delta('ramPercent', base.ramPercent, previous.ramPercent),
      watts: delta('watts', base.watts, previous.watts),
      activeMigrations: base.activeMigrations - previous.activeMigrations,
    },
  };
}

/** True when `key` was not measurable on the tick that produced `snapshot`. */
export function isMetricUnavailable(
  snapshot: EnvironmentSnapshot | undefined,
  key: string,
): boolean {
  return Boolean(snapshot?.unavailableMetrics?.includes(key));
}

/** Render a metric for display, or a dash when it was not measurable. */
export function formatMetric(
  snapshot: EnvironmentSnapshot | undefined,
  key: keyof EnvironmentSnapshot & string,
  format: (value: number) => string,
  placeholder = '—',
): string {
  if (!snapshot || isMetricUnavailable(snapshot, key)) return placeholder;
  const value = snapshot[key];
  return typeof value === 'number' ? format(value) : placeholder;
}

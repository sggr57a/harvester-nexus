/**
 * Multi-window SLO burn-rate calculator.
 *
 * Implements the standard Google SRE pattern: track error-budget burn over
 * two windows simultaneously (5 minutes and 1 hour). When both exceed the
 * tier's threshold, page; when only the short window exceeds, ticket; when
 * neither, the service is healthy. The widget shows both burn rates as a
 * dual-ring gauge.
 *
 * No state — every projection is computed from the latest sample plus the
 * caller-supplied historical slices.
 */

import type { ServiceLevelSample } from './liveTelemetry';

export type BurnSeverity = 'healthy' | 'ticket' | 'page' | 'critical';

export interface BurnRateView {
  serviceId: ServiceLevelSample['id'];
  /** Display label. */
  label: string;
  /** Current request rate. */
  requestsPerSec: number;
  /** Burn rate over the 5-minute window (multiple of acceptable error rate). */
  burnRate5m: number;
  /** Burn rate over the 1-hour window. */
  burnRate1h: number;
  /** Severity bucket — drives gauge colour. */
  severity: BurnSeverity;
  /** Ratio of error budget remaining for the current window 0..1. */
  budgetRemaining: number;
}

export interface ProjectBurnRateInput {
  current: ServiceLevelSample;
  /** Samples within the last 5 minutes — used to compute the short-window
   *  burn rate. The hook supplies a sliding buffer; tests pass an array. */
  shortWindowSamples?: ServiceLevelSample[];
  /** Samples within the last 1 hour. */
  longWindowSamples?: ServiceLevelSample[];
}

const SERVICE_LABELS: Record<ServiceLevelSample['id'], string> = {
  'payments-api': 'PAYMENTS',
  'ledger-svc': 'LEDGER',
  'fraud-detect': 'FRAUD',
  'argocd-api': 'ARGOCD',
};

function meanBurn(samples: ServiceLevelSample[] | undefined, current: ServiceLevelSample): number {
  if (!samples || samples.length === 0) return current.errorBudgetConsumed;
  return samples.reduce((s, x) => s + x.errorBudgetConsumed, 0) / samples.length;
}

export function projectBurnRate({ current, shortWindowSamples, longWindowSamples }: ProjectBurnRateInput): BurnRateView {
  const burnRate5m = meanBurn(shortWindowSamples, current);
  const burnRate1h = meanBurn(longWindowSamples, current);

  // Severity is the worst case across both windows.
  let severity: BurnSeverity;
  if (burnRate5m >= 1.4 || burnRate1h >= 1.4) severity = 'critical';
  else if (burnRate5m >= 1.0 && burnRate1h >= 0.8) severity = 'page';
  else if (burnRate5m >= 0.8 || burnRate1h >= 0.6) severity = 'ticket';
  else severity = 'healthy';

  const budgetRemaining = Math.max(0, 1 - Math.max(burnRate5m, burnRate1h));

  return {
    serviceId: current.id,
    label: SERVICE_LABELS[current.id] ?? current.id,
    requestsPerSec: current.requestsPerSec,
    burnRate5m,
    burnRate1h,
    severity,
    budgetRemaining,
  };
}

/** Project all four canonical services from a single tick of samples. */
export function projectAllBurnRates(
  samples: ServiceLevelSample[],
  shortWindow: ServiceLevelSample[][] = [],
  longWindow: ServiceLevelSample[][] = [],
): BurnRateView[] {
  return samples.map((s, i) =>
    projectBurnRate({
      current: s,
      shortWindowSamples: shortWindow[i],
      longWindowSamples: longWindow[i],
    }),
  );
}

import { describe, expect, it } from 'vitest';
import { projectAllBurnRates, projectBurnRate } from './sloBurnRate';
import type { ServiceLevelSample } from './liveTelemetry';

function svc(id: ServiceLevelSample['id'], over: Partial<ServiceLevelSample> = {}): ServiceLevelSample {
  return {
    id,
    requestsPerSec: 1000,
    errorsLastSample: 0,
    errorBudgetTotal: 1.0,
    errorBudgetConsumed: 0.1,
    ...over,
  };
}

describe('sloBurnRate · projectBurnRate', () => {
  it('healthy service when both windows are quiet', () => {
    const view = projectBurnRate({
      current: svc('payments-api', { errorBudgetConsumed: 0.05 }),
      shortWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.04 })],
      longWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.05 })],
    });
    expect(view.severity).toBe('healthy');
    expect(view.budgetRemaining).toBeGreaterThan(0.9);
  });

  it('ticket when short window is moderately hot', () => {
    const view = projectBurnRate({
      current: svc('payments-api'),
      shortWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.85 })],
      longWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.3 })],
    });
    expect(view.severity).toBe('ticket');
  });

  it('page when both windows are hot', () => {
    const view = projectBurnRate({
      current: svc('payments-api'),
      shortWindowSamples: [svc('payments-api', { errorBudgetConsumed: 1.05 })],
      longWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.85 })],
    });
    expect(view.severity).toBe('page');
  });

  it('critical when burn rate exceeds 1.4 in either window', () => {
    const view = projectBurnRate({
      current: svc('fraud-detect'),
      shortWindowSamples: [svc('fraud-detect', { errorBudgetConsumed: 1.5 })],
      longWindowSamples: [svc('fraud-detect', { errorBudgetConsumed: 0.6 })],
    });
    expect(view.severity).toBe('critical');
  });

  it('uses the current sample when no window history is available', () => {
    const view = projectBurnRate({ current: svc('ledger-svc', { errorBudgetConsumed: 0.5 }) });
    expect(view.burnRate5m).toBe(0.5);
    expect(view.burnRate1h).toBe(0.5);
  });

  it('budgetRemaining is 0 when burn rate is at or above 1', () => {
    const view = projectBurnRate({
      current: svc('payments-api'),
      shortWindowSamples: [svc('payments-api', { errorBudgetConsumed: 1.0 })],
      longWindowSamples: [svc('payments-api', { errorBudgetConsumed: 0.4 })],
    });
    expect(view.budgetRemaining).toBe(0);
  });

  it('label maps service id to a short uppercase callsign', () => {
    const labels = (['payments-api', 'ledger-svc', 'fraud-detect', 'argocd-api'] as const).map(
      (id) => projectBurnRate({ current: svc(id) }).label,
    );
    expect(labels).toEqual(['PAYMENTS', 'LEDGER', 'FRAUD', 'ARGOCD']);
  });
});

describe('sloBurnRate · projectAllBurnRates', () => {
  it('returns one view per service in the same order as the input', () => {
    const samples = [svc('payments-api'), svc('ledger-svc'), svc('fraud-detect'), svc('argocd-api')];
    const views = projectAllBurnRates(samples);
    expect(views.map((v) => v.serviceId)).toEqual(samples.map((s) => s.id));
  });
});

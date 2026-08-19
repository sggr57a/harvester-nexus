import { buildAccelerationDashboard, type PassThroughDevice } from '../dashboards';

/** Compact PCI add-in card on the environment tick (same pulse as CPU / RAM). */
export interface EnvironmentAccelDevice {
  id: string;
  kind: string;
  model: string;
  temperatureC?: number | null;
  linkDownshifted?: boolean;
  issues?: string[];
  currentLinkSpeed?: string | null;
  driver?: string | null;
}

export interface EnvironmentAcceleratorSummary {
  cards: number;
  issues: number;
  hottestC: number | null;
  byKind: Record<string, number>;
  waitingForHardware: string[];
  devices: EnvironmentAccelDevice[];
  available?: boolean;
  error?: string | null;
}

export interface HardwareTickerCell {
  key: 'accelCards' | 'accelIssues' | 'accelHottestC';
  label: string;
  value: string;
  sub: string;
  delta?: number;
}

export interface HardwareTotal {
  label: string;
  value: string;
}

export function emptyAcceleratorSummary(): EnvironmentAcceleratorSummary {
  return {
    cards: 0,
    issues: 0,
    hottestC: null,
    byKind: {},
    waitingForHardware: [],
    devices: [],
    available: true,
  };
}

function kindBreakdown(byKind: Record<string, number>): string {
  const parts = Object.entries(byKind)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${count} ${kind}`);
  return parts.length > 0 ? parts.join(' · ') : 'none present';
}

export function summarizeFromPassThrough(
  devices: PassThroughDevice[],
  waitingForHardware: string[] = [],
): EnvironmentAcceleratorSummary {
  const byKind: Record<string, number> = {};
  const temps: number[] = [];
  let issues = 0;
  const compact: EnvironmentAccelDevice[] = devices.map((dev) => {
    byKind[dev.kind] = (byKind[dev.kind] ?? 0) + 1;
    if (typeof dev.temperatureC === 'number' && Number.isFinite(dev.temperatureC)) {
      temps.push(dev.temperatureC);
    }
    issues += dev.issues?.length ?? 0;
    return {
      id: dev.id,
      kind: dev.kind,
      model: dev.model,
      temperatureC: dev.temperatureC ?? null,
      linkDownshifted: dev.linkDownshifted,
      issues: dev.issues ?? [],
      currentLinkSpeed: dev.currentLinkSpeed ?? null,
      driver: dev.driver,
    };
  });
  return {
    available: true,
    cards: devices.length,
    issues,
    hottestC: temps.length ? Math.max(...temps) : null,
    byKind,
    waitingForHardware,
    devices: compact,
  };
}

/** Demo catalog pulse so CPU/RAM dashboards still show add-in cards offline. */
export function demoAcceleratorSummary(): EnvironmentAcceleratorSummary {
  return summarizeFromPassThrough(buildAccelerationDashboard().passThrough);
}

export function hardwareTickerCells(
  summary: EnvironmentAcceleratorSummary | undefined,
): HardwareTickerCell[] {
  const accel = summary ?? emptyAcceleratorSummary();
  const waiting = accel.waitingForHardware.length
    ? `waiting ${accel.waitingForHardware.length}`
    : 'allowlisted PCI';
  return [
    {
      key: 'accelCards',
      label: 'Accel cards',
      value: String(accel.cards),
      sub: accel.cards > 0 ? kindBreakdown(accel.byKind) : waiting,
    },
    {
      key: 'accelIssues',
      label: 'Accel issues',
      value: String(accel.issues),
      sub: accel.issues > 0 ? 'link · AER · driver · IOMMU' : 'no PCI alerts',
    },
    {
      key: 'accelHottestC',
      label: 'Accel °C',
      value: accel.hottestC == null ? '—' : `${accel.hottestC}°`,
      sub: accel.hottestC == null ? 'no hwmon' : 'hottest add-in card',
    },
  ];
}

export function hardwareAddOnTotals(
  summary: EnvironmentAcceleratorSummary | undefined,
): HardwareTotal[] {
  const accel = summary ?? emptyAcceleratorSummary();
  return [
    { label: 'Accel', value: String(accel.cards) },
    { label: 'Accel issues', value: String(accel.issues) },
    { label: 'Accel °C', value: accel.hottestC == null ? '—' : `${accel.hottestC}°` },
  ];
}

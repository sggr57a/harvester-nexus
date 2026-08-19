export type TelemetryMode = 'auto' | 'demo' | 'live';

export type ResolvedTelemetryMode = 'demo' | 'live';

export interface TelemetryState {
  mode: ResolvedTelemetryMode;
  /** Requested mode before auto-resolution */
  requested: TelemetryMode;
  liveAvailable: boolean;
  clusterReady: boolean;
  message?: string;
}

const STORAGE_KEY = 'nexus.telemetryMode';

export function isTelemetryMode(value: unknown): value is TelemetryMode {
  return value === 'auto' || value === 'demo' || value === 'live';
}

export function readStoredTelemetryMode(): TelemetryMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTelemetryMode(stored) ? stored : 'auto';
}

export function writeStoredTelemetryMode(mode: TelemetryMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveTelemetryMode(requested: TelemetryMode, liveAvailable: boolean): ResolvedTelemetryMode {
  if (requested === 'demo') return 'demo';
  if (requested === 'live') return liveAvailable ? 'live' : 'demo';
  return liveAvailable ? 'live' : 'demo';
}

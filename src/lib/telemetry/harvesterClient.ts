import type { DashboardTelemetryPayload } from './dashboardTypes';
import type { EnvironmentTelemetryPayload, LiveHealthPayload } from './types';

const API_BASE = '/api/v1';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchLiveHealth(): Promise<LiveHealthPayload | null> {
  return fetchJson<LiveHealthPayload>('/health/live');
}

export async function fetchEnvironmentTelemetry(): Promise<EnvironmentTelemetryPayload | null> {
  return fetchJson<EnvironmentTelemetryPayload>('/telemetry/environment');
}

export async function fetchDashboardTelemetry(): Promise<DashboardTelemetryPayload | null> {
  return fetchJson<DashboardTelemetryPayload>('/telemetry/dashboards');
}

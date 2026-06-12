import type { HarvesterDashboardPayload, HarvesterResourceListPayload, HarvesterResourceType } from './harvesterTypes';

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

export async function fetchHarvesterResourceList(type: HarvesterResourceType): Promise<HarvesterResourceListPayload | null> {
  return fetchJson<HarvesterResourceListPayload>(`/harvester/resources/${encodeURIComponent(type)}`);
}

export async function fetchHarvesterDashboard(): Promise<HarvesterDashboardPayload | null> {
  return fetchJson<HarvesterDashboardPayload>('/harvester/dashboard');
}

export async function executeHarvesterAction(
  type: HarvesterResourceType,
  action: string,
  resourceIds: string[],
): Promise<{ success: boolean; message: string } | null> {
  return fetchJson<{ success: boolean; message: string }>('/harvester/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, action, resourceIds }),
  });
}

/** Deep-link to stock Harvester dashboard resource page (production :443) */
export function harvesterDashboardDeepLink(type: HarvesterResourceType, clusterId = 'local'): string {
  return `https://${window.location.hostname}:443/dashboard/c/${clusterId}/harvester/${type}`;
}

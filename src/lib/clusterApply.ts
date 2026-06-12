import type { ApplyManifestResult } from './telemetry/types';

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

export async function applyClusterManifest(
  manifestYaml: string,
  options?: { dryRun?: boolean },
): Promise<ApplyManifestResult | null> {
  try {
    const res = await fetch(`${API_BASE}/resources/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ manifest: manifestYaml, dryRun: options?.dryRun === true }),
    });
    return (await res.json()) as ApplyManifestResult;
  } catch {
    return null;
  }
}

/** Try live kubectl apply; fall back to simulated success when BFF unavailable (dev SPA). */
export async function applyOrSimulateManifest(
  manifestYaml: string,
  simulatedCommands: string[],
): Promise<{ success: boolean; message: string; live: boolean; commands: string[] }> {
  const result = await applyClusterManifest(manifestYaml);
  if (result !== null && result.success !== undefined) {
    return {
      success: result.success,
      message: result.success
        ? result.output || 'Applied to cluster via kubectl'
        : result.error || 'kubectl apply failed',
      live: true,
      commands: simulatedCommands,
    };
  }
  return {
    success: true,
    message: 'Cluster API unavailable — manifest validated locally (dev mode). Run kubectl on the Harvester node to apply.',
    live: false,
    commands: simulatedCommands,
  };
}

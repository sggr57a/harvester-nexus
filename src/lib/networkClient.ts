import type { ApplyManifestResult } from './telemetry/types';
import type { VirtualNicAttachRequest, VirtualNicAttachResult } from './machineNetworkAttach';
import { ovsProvisionCommands, type OvsProvisionConfig } from './ovsProvisioning';
import { applyOrSimulateManifest } from './clusterApply';

const API_BASE = '/api/v1';

export async function applyOvsOperations(commands: string[]): Promise<{ success: boolean; message: string; live: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/networking/ovs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ commands }),
    });
    if (!res.ok) return { success: false, message: `OVS API HTTP ${res.status}`, live: true };
    const payload = (await res.json()) as { success: boolean; error?: string; output?: string };
    return {
      success: payload.success,
      message: payload.success ? payload.output || 'OVS commands applied' : payload.error || 'OVS apply failed',
      live: true,
    };
  } catch {
    return {
      success: false,
      message: 'OVS API unavailable — ensure the Nexus BFF is running on the Harvester node.',
      live: false,
    };
  }
}

export async function applyOvsProvision(config: OvsProvisionConfig, manifestYaml: string): Promise<{ success: boolean; message: string; live: boolean }> {
  const k8s = await applyOrSimulateManifest(manifestYaml, ovsProvisionCommands(config));
  const ovs = await applyOvsOperations(ovsProvisionCommands(config));
  if (!k8s.success) return k8s;
  if (!ovs.success) return ovs;
  return {
    success: true,
    message: [k8s.message, ovs.message].filter(Boolean).join(' · '),
    live: k8s.live && ovs.live,
  };
}

export async function attachMachineNetwork(request: VirtualNicAttachRequest): Promise<VirtualNicAttachResult> {
  try {
    const res = await fetch(`${API_BASE}/machines/attach-network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
    if (res.ok) {
      const payload = (await res.json()) as { success: boolean; error?: string; output?: string };
      return {
        success: payload.success,
        message: payload.success ? payload.output || 'Virtual NIC attached' : payload.error || 'Attach failed',
        live: true,
        interfaceName: request.interfaceName,
      };
    }
  } catch {
    // fall through
  }
  return {
    success: false,
    message: `Cluster API unavailable — could not attach ${request.interfaceName}. Ensure the Nexus BFF is running.`,
    live: false,
    interfaceName: request.interfaceName,
  };
}

export async function applyNetworkBundle(
  manifestYaml: string,
  ovsCommands: string[],
  simulatedKubectl: string[],
): Promise<{ success: boolean; message: string; live: boolean }> {
  const k8s = await applyOrSimulateManifest(manifestYaml, simulatedKubectl);
  if (!k8s.success) return k8s;
  if (ovsCommands.length === 0) return k8s;
  const ovs = await applyOvsOperations(ovsCommands);
  if (!ovs.success) return ovs;
  return {
    success: true,
    message: `${k8s.message} · ${ovs.message}`,
    live: k8s.live && ovs.live,
  };
}

export type { ApplyManifestResult };

import type { MachineNetwork } from './dashboards';
import type { VirtualNicAttachRequest } from './machineNetworkAttach';

const STORAGE_KEY = 'nexus.machine-networks';

export interface AttachedVirtualNic {
  id: string;
  machineId: string;
  interfaceName: string;
  networkAttachment: string;
  ovsBridge?: string;
  vlanId?: number;
  networkType: string;
  ip?: string;
  mac?: string;
  createdAt: string;
}

export interface MachineNetworkState {
  attachments: AttachedVirtualNic[];
  revision: number;
}

const EMPTY: MachineNetworkState = { attachments: [], revision: 0 };

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => l());
}

function readState(): MachineNetworkState {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as MachineNetworkState;
    return {
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeState(state: MachineNetworkState): MachineNetworkState {
  const next = { ...state, revision: state.revision + 1 };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  notify();
  return next;
}

export function subscribeMachineNetworks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordVirtualNicAttach(request: VirtualNicAttachRequest, networkType: string): AttachedVirtualNic {
  const state = readState();
  const nic: AttachedVirtualNic = {
    id: `vnic-${request.machineId}-${request.interfaceName}`,
    machineId: request.machineId,
    interfaceName: request.interfaceName,
    networkAttachment: request.networkAttachment,
    ovsBridge: request.ovsBridge,
    vlanId: request.vlanId,
    networkType,
    ip: syntheticIp(request),
    mac: syntheticMac(request),
    createdAt: new Date().toISOString(),
  };
  return writeState({
    ...state,
    attachments: [...state.attachments.filter((a) => a.id !== nic.id), nic],
  }).attachments.find((a) => a.id === nic.id)!;
}

function syntheticIp(request: VirtualNicAttachRequest): string {
  const base = request.vlanId ?? 42;
  return `10.${Math.min(255, base)}.${(request.interfaceName.charCodeAt(3) ?? 1) % 250}.10`;
}

function syntheticMac(request: VirtualNicAttachRequest): string {
  const seed = request.machineName.length + request.interfaceName.length;
  return `52:54:00:${(seed % 256).toString(16).padStart(2, '0')}:${((seed * 7) % 256).toString(16).padStart(2, '0')}:${((seed * 13) % 256).toString(16).padStart(2, '0')}`;
}

export function attachmentsForMachine(machineId: string): AttachedVirtualNic[] {
  return readState().attachments.filter((a) => a.machineId === machineId);
}

export function mergeAttachmentsOntoNetworks(
  machineId: string,
  base: MachineNetwork[] | undefined,
): MachineNetwork[] {
  const merged = [...(base ?? [])];
  for (const attach of attachmentsForMachine(machineId)) {
    if (merged.some((n) => n.name === attach.interfaceName)) continue;
    merged.push({
      name: attach.interfaceName,
      ip: attach.ip,
      mac: attach.mac,
      type: attach.ovsBridge ? `ovs:${attach.ovsBridge}` : attach.networkType,
    });
  }
  return merged;
}

export function getMachineNetworkRevision(): number {
  return readState().revision;
}

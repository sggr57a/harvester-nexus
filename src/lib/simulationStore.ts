import { useEffect, useState } from 'react';
import type { ApplicationConfig } from '../types';
import type { ActiveWorkItem } from './activeOperations';
import type { MachineRow } from './dashboards';
import type { WorkloadCreateConfig } from './deploySimulation';
import type { HarvesterMachineConfig } from './harvesterMachineWizard';

const STORAGE_KEY = 'nexus.simulation';

let memoryState: SimulationState | null = null;

export interface SimulatedNode {
  id: string;
  hostName: string;
  role: 'control-plane' | 'worker';
  createdAt: string;
}

export interface SimulatedWorkload {
  id: string;
  name: string;
  kind: MachineRow['kind'];
  host: string;
  namespace: string;
  cpuCores: number;
  memoryGiB: number;
  status: MachineRow['status'];
  createdAt: string;
}

export interface SimulationState {
  nodes: SimulatedNode[];
  workloads: SimulatedWorkload[];
  revision: number;
}

const EMPTY_STATE: SimulationState = { nodes: [], workloads: [], revision: 0 };

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeSimulation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readState(): SimulationState {
  if (typeof window === 'undefined') {
    return memoryState ? { ...memoryState } : { ...EMPTY_STATE };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as SimulationState;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      workloads: Array.isArray(parsed.workloads) ? parsed.workloads : [],
      revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function writeState(state: SimulationState): SimulationState {
  const next = { ...state, revision: state.revision + 1 };
  if (typeof window === 'undefined') {
    memoryState = next;
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  notifyListeners();
  return next;
}

function pickHost(state: SimulationState, preferred?: string): string {
  if (preferred && preferred !== 'any') {
    const match = state.nodes.find((node) => node.hostName === preferred);
    if (match) return match.hostName;
  }
  if (state.nodes.length > 0) {
    const index = state.workloads.length % state.nodes.length;
    return state.nodes[index]?.hostName ?? state.nodes[0].hostName;
  }
  return 'compute-01';
}

function syntheticCpu(seed: string, min = 18, max = 72): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const span = max - min;
  return min + (Math.abs(hash) % span);
}

export function getSimulationState(): SimulationState {
  return readState();
}

export function clearSimulationState(): void {
  memoryState = { ...EMPTY_STATE, revision: 0 };
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  notifyListeners();
}

export function recordClusterDeploy(config: HarvesterMachineConfig): SimulationState {
  const state = readState();
  const node: SimulatedNode = {
    id: `sim-node-${config.hostName}`,
    hostName: config.hostName,
    role: config.installMode === 'create' ? 'control-plane' : 'worker',
    createdAt: new Date().toISOString(),
  };
  const nodes = [...state.nodes.filter((entry) => entry.id !== node.id), node];
  if (config.installMode === 'create' && nodes.length === 1) {
    nodes.push(
      {
        id: 'sim-node-compute-02',
        hostName: 'compute-02',
        role: 'worker',
        createdAt: node.createdAt,
      },
      {
        id: 'sim-node-compute-03',
        hostName: 'compute-03',
        role: 'worker',
        createdAt: node.createdAt,
      },
    );
  }
  return writeState({ ...state, nodes });
}

export function recordWorkloadDeploy(config: ApplicationConfig): SimulationState {
  const state = readState();
  const host = pickHost(state);
  const workload: SimulatedWorkload = {
    id: `sim-workload-${config.namespace}-${config.appName}`,
    name: config.appName,
    kind: config.workloadType === 'Deployment' ? 'pod' : 'pod',
    host,
    namespace: config.namespace,
    cpuCores: 2,
    memoryGiB: 4,
    status: 'running',
    createdAt: new Date().toISOString(),
  };
  return writeState({
    ...state,
    workloads: [...state.workloads.filter((entry) => entry.id !== workload.id), workload],
  });
}

export function recordPolyComputeDeploy(config: WorkloadCreateConfig): SimulationState {
  const state = readState();
  const host = pickHost(state, config.hostAffinity);
  const kind: MachineRow['kind'] =
    config.kind === 'kubevirt-vm' ? 'vm' : config.kind === 'incus-lxc' ? 'lxc' : 'pod';
  const workload: SimulatedWorkload = {
    id: `sim-${kind}-${config.namespace}-${config.name}`,
    name: config.name,
    kind,
    host,
    namespace: config.namespace,
    cpuCores: config.cpuCores,
    memoryGiB: config.memoryGiB,
    status: 'running',
    createdAt: new Date().toISOString(),
  };
  return writeState({
    ...state,
    workloads: [...state.workloads.filter((entry) => entry.id !== workload.id), workload],
  });
}

export function simulationNodesToFleet(state: SimulationState): MachineRow[] {
  return state.nodes.map((node) => ({
    id: node.id,
    name: node.hostName,
    kind: 'node' as MachineRow['kind'],
    host: node.hostName,
    cpuPercent: syntheticCpu(node.hostName, 22, 58),
    ramGiB: 32,
    ramAllocGiB: 64,
    status: 'running' as const,
    haEnabled: node.role === 'control-plane',
    affinity: 'none' as const,
  }));
}

export function simulationWorkloadsToFleet(state: SimulationState): MachineRow[] {
  return state.workloads.map((workload) => ({
    id: workload.id,
    name: workload.name,
    kind: workload.kind,
    host: workload.host,
    cpuPercent: syntheticCpu(workload.name, 12, 85),
    ramGiB: workload.memoryGiB,
    ramAllocGiB: workload.memoryGiB,
    status: workload.status,
    haEnabled: true,
    affinity: 'none' as const,
  }));
}

export function simulationToFleet(state: SimulationState = readState()): MachineRow[] {
  return [...simulationNodesToFleet(state), ...simulationWorkloadsToFleet(state)];
}

export function simulationToWorkItems(state: SimulationState = readState()): ActiveWorkItem[] {
  return state.workloads.slice(-6).map((workload) => ({
    id: workload.id,
    kind: workload.kind === 'vm' ? 'migration' : workload.kind === 'lxc' ? 'docker-container' : 'pod-activity',
    label:
      workload.kind === 'vm'
        ? 'Virtual machine activity'
        : workload.kind === 'lxc'
          ? 'LXC container activity'
          : 'Kubernetes pod activity',
    target: `${workload.namespace} / ${workload.name} on ${workload.host}`,
    progress: 100,
    status: 'active' as const,
  }));
}

export function useSimulationRevision(): number {
  const [revision, setRevision] = useState(() => readState().revision);

  useEffect(() => subscribeSimulation(() => setRevision(readState().revision)), []);

  return revision;
}

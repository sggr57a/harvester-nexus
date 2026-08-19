import type { EnvironmentSnapshot } from './liveTelemetry';
import type { MachineRow } from './dashboards';
import type { ResourceMonitoring } from './activeOperations';

export interface HudNodeRow {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  disk: number;
  net: number;
  power: number;
  thermalC: number;
  status: 'ok' | 'hot' | 'act' | 'warn';
  event?: string;
}

export interface HudClusterModel {
  nodes: HudNodeRow[];
  eventLabel: string;
  activity: number;
}

const HOST_POSITIONS: Record<string, { x: number; y: number }> = {
  'compute-01': { x: 22, y: 58 },
  'compute-02': { x: 52, y: 42 },
  'compute-03': { x: 78, y: 62 },
  'edge-a': { x: 18, y: 78 },
  'edge-b': { x: 82, y: 28 },
  'edge-c': { x: 68, y: 82 },
  cluster: { x: 50, y: 50 },
};

function thermalFromCpu(cpu: number): number {
  return Math.round(32 + cpu * 0.18);
}

function powerFromCpu(cpu: number, watts: number, nodeCount: number): number {
  const base = watts / Math.max(1, nodeCount);
  return Math.round(base * (0.7 + (cpu / 100) * 0.6));
}

function statusFor(cpu: number, event?: string): HudNodeRow['status'] {
  if (event) return 'act';
  if (cpu > 65) return 'hot';
  if (cpu > 50) return 'warn';
  return 'ok';
}

function aggregateHost(host: string, fleet: MachineRow[], telemetry: EnvironmentSnapshot | undefined): HudNodeRow {
  const nodeRow = fleet.find((row) => row.kind === 'node' && row.host === host);
  const workloads = fleet.filter((row) => row.host === host && row.kind !== 'node');
  const cpu = nodeRow?.cpuPercent
    ?? (workloads.length
      ? workloads.reduce((sum, row) => sum + row.cpuPercent, 0) / workloads.length
      : telemetry?.cpuPercent ?? 40);
  const ram = nodeRow
    ? (nodeRow.ramGiB / Math.max(1, nodeRow.ramAllocGiB)) * 100
    : workloads.length
      ? workloads.reduce((sum, row) => sum + (row.ramGiB / Math.max(1, row.ramAllocGiB)) * 100, 0) / workloads.length
      : telemetry?.ramPercent ?? 55;
  const disk = telemetry ? Math.min(100, telemetry.totalIops / 14_000) : 48;
  const net = telemetry ? Math.min(100, telemetry.ingressMbps / 1_100) : 42;
  const migrating = workloads.some((row) => row.status === 'migrating');
  const event = migrating ? 'live migration' : undefined;
  const nodeCount = new Set(fleet.map((row) => row.host)).size || 3;

  return {
    id: host,
    name: host,
    cpu,
    ram,
    disk,
    net,
    power: powerFromCpu(cpu, telemetry?.watts ?? 1592, nodeCount),
    thermalC: thermalFromCpu(cpu),
    status: statusFor(cpu, event),
    event,
  };
}

export function buildHudClusterModel(
  fleet: MachineRow[],
  telemetry: EnvironmentSnapshot | undefined,
  resourceMonitoring?: ResourceMonitoring,
  options?: { liveMode?: boolean },
): HudClusterModel {
  const infraHosts = fleet.filter((row) => row.kind === 'node').map((row) => row.host);
  const workloadHosts = fleet.filter((row) => row.kind !== 'node').map((row) => row.host);
  const hosts = [...new Set([...infraHosts, ...workloadHosts])];
  const fallbackHosts = options?.liveMode ? [] : ['compute-01', 'compute-02', 'compute-03'];
  const nodes = (hosts.length ? hosts : fallbackHosts).map((host) =>
    aggregateHost(host, fleet, telemetry),
  );

  const activeCount = resourceMonitoring?.workItems.length ?? telemetry?.activeMigrations ?? 0;
  const eventLabel =
    resourceMonitoring?.workItems[0]?.label ??
    (telemetry?.activeMigrations ? `${telemetry.activeMigrations} live migrations` : 'steady state');

  const activity = Math.min(
    1,
    (telemetry?.cpuPercent ?? 40) / 100 * 0.5 +
      (activeCount / 8) * 0.35 +
      (telemetry?.deltas?.cpuPercent ? Math.abs(telemetry.deltas.cpuPercent) / 20 : 0) * 0.15,
  );

  return { nodes, eventLabel, activity };
}

export function buildCity3DNodes(model: HudClusterModel) {
  return model.nodes.map((node, index) => {
    const pos = HOST_POSITIONS[node.name] ?? {
      x: 20 + (index % 3) * 28,
      y: 35 + Math.floor(index / 3) * 22,
    };
    return {
      id: node.id,
      label: node.name,
      x: pos.x,
      y: pos.y,
      load: node.cpu,
      kind: node.name.startsWith('edge') ? ('edge' as const) : ('compute' as const),
      status: node.status === 'hot' ? ('watch' as const) : node.status === 'act' ? ('syncing' as const) : ('online' as const),
    };
  });
}

export function buildCity3DEdges(model: HudClusterModel) {
  const ids = model.nodes.map((n) => n.id);
  if (ids.length < 2) return [];
  const edges: { from: string; to: string; channel: 'mesh'; load: number }[] = [];
  for (let i = 0; i < ids.length - 1; i += 1) {
    edges.push({ from: ids[i], to: ids[i + 1], channel: 'mesh', load: 40 + i * 12 });
  }
  if (ids.length > 2) {
    edges.push({ from: ids[0], to: ids[ids.length - 1], channel: 'mesh', load: 55 });
  }
  return edges;
}

export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function fmtK(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}

export function fmtMb(v: number): string {
  return `${Math.round(v)} Mb/s`;
}

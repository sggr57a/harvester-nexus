import YAML from 'yaml';
import type { MachineRow, NetworkingDashboard } from './dashboards';
import type { HypervisorNicModel } from './hypervisorNetworking';
import { kubevirtModelForNic } from './hypervisorNetworking';
import { buildOvsNadManifest } from './ovsProvisioning';
import type { TelemetryDataSource } from './telemetry/dashboardAdapters';

export type AttachableNetworkBackend = 'harvester-nad' | 'ovs-bridge' | 'kubevirt-default';

export interface AttachableNetwork {
  id: string;
  name: string;
  nadRef: string;
  backend: AttachableNetworkBackend;
  ovsBridge?: string;
  vlanId?: number;
  networkType: 'vlan' | 'overlay' | 'vxlan' | 'geneve' | 'default';
}

export interface VirtualNicAttachRequest {
  machineId: string;
  machineName: string;
  namespace: string;
  kind: MachineRow['kind'];
  interfaceName: string;
  networkAttachment: string;
  ovsBridge?: string;
  vlanId?: number;
  model?: HypervisorNicModel;
}

export interface VirtualNicAttachResult {
  success: boolean;
  message: string;
  live: boolean;
  interfaceName: string;
}

export const DEFAULT_ATTACHABLE_NETWORKS: AttachableNetwork[] = [
  { id: 'mgmt', name: 'Management (default)', nadRef: 'default/mgmt', backend: 'harvester-nad', networkType: 'default' },
  { id: 'pg-tenant-a', name: 'Port group · Tenant A VLAN 40', nadRef: 'default/pg-tenant-a', backend: 'ovs-bridge', ovsBridge: 'br-tenant', vlanId: 40, networkType: 'vlan' },
  { id: 'pg-tenant-b', name: 'Port group · Tenant B VLAN 50', nadRef: 'default/pg-tenant-b', backend: 'ovs-bridge', ovsBridge: 'br-tenant', vlanId: 50, networkType: 'vlan' },
  { id: 'hostonly0', name: 'Host-only network', nadRef: 'default/hostonly0', backend: 'harvester-nad', networkType: 'default' },
  { id: 'nat-net', name: 'NAT network', nadRef: 'default/nat-net', backend: 'harvester-nad', networkType: 'default' },
  { id: 'macvtap-wan', name: 'Macvtap passthrough', nadRef: 'default/macvtap-wan', backend: 'harvester-nad', networkType: 'vlan' },
  { id: 'sriov-net', name: 'SR-IOV VF', nadRef: 'default/sriov-net', backend: 'harvester-nad', networkType: 'vlan' },
  { id: 'vxlan-a', name: 'SDN VXLAN zone A', nadRef: 'default/vxlan-overlay-a', backend: 'harvester-nad', networkType: 'vxlan' },
];

function networkTypeFromLabel(label?: string): AttachableNetwork['networkType'] {
  const normalized = (label ?? '').toLowerCase();
  if (normalized.includes('vxlan')) return 'vxlan';
  if (normalized.includes('geneve')) return 'geneve';
  if (normalized.includes('overlay')) return 'overlay';
  if (normalized.includes('vlan')) return 'vlan';
  return 'default';
}

/** Demo catalog networks for SPA walkthroughs; live mode uses cluster NAD inventory only. */
export function attachableNetworksForSource(
  dataSource: TelemetryDataSource | undefined,
  networking?: NetworkingDashboard,
): AttachableNetwork[] {
  if (dataSource !== 'live') return DEFAULT_ATTACHABLE_NETWORKS;

  const nads = networking?.nads ?? [];
  if (nads.length > 0) {
    return nads.map((nad) => ({
      id: nad.id || `${nad.namespace}/${nad.name}`,
      name: `${nad.namespace}/${nad.name}`,
      nadRef: `${nad.namespace}/${nad.name}`,
      backend: nad.ovsBridge ? 'ovs-bridge' : 'harvester-nad',
      ovsBridge: nad.ovsBridge,
      vlanId: nad.vlanId,
      networkType: networkTypeFromLabel(nad.networkType),
    }));
  }

  const portGroups = networking?.portGroups ?? [];
  if (portGroups.length > 0) {
    return portGroups.map((pg) => ({
      id: pg.id,
      name: pg.name,
      nadRef: `default/${pg.name}`,
      backend: pg.bridge.startsWith('br-') ? 'ovs-bridge' : 'harvester-nad',
      ovsBridge: pg.bridge.startsWith('br-') ? pg.bridge : undefined,
      vlanId: pg.vlanId,
      networkType: 'vlan' as const,
    }));
  }

  return [];
}

export function nextInterfaceName(existing: string[] = []): string {
  const used = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 1; i < 32; i += 1) {
    const name = `net${i}`;
    if (!used.has(name)) return name;
  }
  return `net${Date.now() % 1000}`;
}

export function buildVmNicAttachManifest(request: VirtualNicAttachRequest, existingNetworks: object[] = [], existingInterfaces: object[] = []): string {
  const ifaceName = request.interfaceName;
  const model = kubevirtModelForNic(request.model ?? 'virtio');
  const networks = [
    ...existingNetworks,
    {
      name: ifaceName,
      multus: {
        networkName: request.networkAttachment,
        default: existingNetworks.length === 0,
      },
    },
  ];
  const interfaces = [
    ...existingInterfaces,
    {
      name: ifaceName,
      model,
      bridge: {},
    },
  ];

  return YAML.stringify({
    apiVersion: 'kubevirt.io/v1',
    kind: 'VirtualMachine',
    metadata: { name: request.machineName, namespace: request.namespace },
    spec: {
      template: {
        spec: {
          networks,
          domain: {
            devices: {
              interfaces,
            },
          },
        },
      },
    },
  });
}

export function buildPodMultusPatchManifest(request: VirtualNicAttachRequest, currentAnnotation = '[]'): string {
  let networks: { name: string; interface?: string }[];
  try {
    networks = JSON.parse(currentAnnotation) as { name: string; interface?: string }[];
    if (!Array.isArray(networks)) networks = [];
  } catch {
    networks = [];
  }
  networks.push({
    name: request.networkAttachment,
    interface: request.interfaceName,
  });

  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: request.machineName,
      namespace: request.namespace,
      annotations: {
        'k8s.v1.cni.cncf.io/networks': JSON.stringify(networks),
        'nexus.nexus.io/ovs-bridge': request.ovsBridge ?? '',
      },
    },
  });
}

export function buildOvsNicNadIfNeeded(request: VirtualNicAttachRequest): string | null {
  if (!request.ovsBridge || request.vlanId === undefined) return null;
  const nadName = `${request.machineName}-${request.interfaceName}-nad`;
  return buildOvsNadManifest(request.ovsBridge, nadName, request.vlanId, request.namespace);
}

export function attachNetworkCommands(request: VirtualNicAttachRequest): string[] {
  switch (request.kind) {
    case 'vm':
      return [
        `kubectl patch vm ${request.machineName} -n ${request.namespace} --type merge -p @- <<'EOF'\n${buildVmNicAttachManifest(request)}\nEOF`,
      ];
    case 'pod':
    case 'lxc':
    case 'docker':
      return [
        `kubectl annotate pod ${request.machineName} -n ${request.namespace} k8s.v1.cni.cncf.io/networks='[{"name":"${request.networkAttachment}","interface":"${request.interfaceName}"}]' --overwrite`,
      ];
    default:
      return ['# Physical node NICs are managed via OVS uplink / VlanConfig on the host'];
  }
}

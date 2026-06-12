import YAML from 'yaml';

/**
 * Hypervisor-equivalent networking (Proxmox, VMware, KVM, Hyper-V).
 * Maps to Harvester ClusterNetwork, Linux/OVS bridges, Multus NADs, and KubeVirt interfaces.
 */

export type VirtualBridgeKind = 'linux-bridge' | 'openvswitch' | 'harvester-clusternetwork' | 'distributed-switch';
export type PortGroupVlanMode = 'access' | 'trunk' | 'qinq' | 'native';
export type IsolatedNetworkKind = 'host-only' | 'nat' | 'internal' | 'bridged';
export type HypervisorNicModel = 'virtio' | 'e1000' | 'e1000e' | 'rtl8139' | 'vmxnet3';
export type PassthroughKind = 'macvtap' | 'ipvlan' | 'sriov-vf' | 'pci-passthrough';
export type BondMode = 'active-backup' | '802.3ad' | 'balance-xor' | 'broadcast';

export interface VirtualBridgeConfig {
  name: string;
  kind: VirtualBridgeKind;
  bridgeName: string;
  uplinkNic?: string;
  vlanAware: boolean;
  mtu: number;
  description?: string;
}

export interface PortGroupConfig {
  name: string;
  bridge: string;
  vlanId: number;
  vlanMode: PortGroupVlanMode;
  cidr: string;
  gateway?: string;
  isolated: boolean;
}

export interface IsolatedNetworkConfig {
  name: string;
  kind: IsolatedNetworkKind;
  bridge: string;
  cidr: string;
  gateway: string;
  dhcpEnabled: boolean;
  masquerade: boolean;
}

export interface NicBondConfig {
  name: string;
  bridge: string;
  slaves: string[];
  mode: BondMode;
  miimon: number;
  lacpRate?: 'slow' | 'fast';
}

export interface SdnZoneConfig {
  name: string;
  zoneType: 'vxlan' | 'evpn' | 'simple';
  vni: number;
  bridge: string;
  nodes: string[];
  tenant: string;
}

export interface PassthroughNetworkConfig {
  name: string;
  kind: PassthroughKind;
  parentNic: string;
  vlanId?: number;
  sriovResourceName?: string;
  mode?: 'l2' | 'l3';
}

export interface FirewallZoneConfig {
  name: string;
  bridge: string;
  defaultPolicy: 'drop' | 'accept';
  allowedPorts: number[];
  allowedCidrs: string[];
  namespace: string;
}

export interface HypervisorNetworkConfig {
  bridge: VirtualBridgeConfig;
  portGroup: PortGroupConfig;
  isolated: IsolatedNetworkConfig;
  bond: NicBondConfig;
  sdnZone: SdnZoneConfig;
  passthrough: PassthroughNetworkConfig;
  firewall: FirewallZoneConfig;
}

export type HypervisorNetworkTask =
  | 'virtual-bridge'
  | 'port-group'
  | 'host-only-network'
  | 'nat-network'
  | 'bridged-network'
  | 'nic-bond'
  | 'sdn-zone'
  | 'macvtap-network'
  | 'sriov-network'
  | 'ipvlan-network'
  | 'firewall-zone';

export function buildDefaultHypervisorNetworkConfig(task: HypervisorNetworkTask = 'virtual-bridge'): HypervisorNetworkConfig {
  return {
    bridge: {
      name: 'vmbr1',
      kind: 'linux-bridge',
      bridgeName: 'vmbr1',
      uplinkNic: 'eth1',
      vlanAware: true,
      mtu: 1500,
      description: 'Proxmox-style VLAN-aware Linux bridge',
    },
    portGroup: {
      name: 'pg-tenant-a',
      bridge: 'vmbr1',
      vlanId: 100,
      vlanMode: 'access',
      cidr: '10.30.100.0/24',
      gateway: '10.30.100.1',
      isolated: false,
    },
    isolated: {
      name: 'hostonly0',
      kind: 'host-only',
      bridge: 'vmbr-hostonly',
      cidr: '192.168.56.0/24',
      gateway: '192.168.56.1',
      dhcpEnabled: true,
      masquerade: false,
    },
    bond: {
      name: 'bond0',
      bridge: 'vmbr1',
      slaves: ['eth1', 'eth2'],
      mode: '802.3ad',
      miimon: 100,
      lacpRate: 'fast',
    },
    sdnZone: {
      name: 'sdn-zone-a',
      zoneType: 'vxlan',
      vni: 11001,
      bridge: 'vmbr1',
      nodes: ['node-01', 'node-02'],
      tenant: 'tenant-a',
    },
    passthrough: {
      name: 'macvtap-wan',
      kind: 'macvtap',
      parentNic: 'eth0',
      vlanId: 200,
      mode: 'l2',
    },
    firewall: {
      name: 'fw-zone-tenant-a',
      bridge: 'vmbr1',
      defaultPolicy: 'drop',
      allowedPorts: [22, 443, 6443],
      allowedCidrs: ['10.30.100.0/24'],
      namespace: 'tenant-a',
    },
  };
}

export function hypervisorTaskLabel(task: HypervisorNetworkTask): string {
  const labels: Record<HypervisorNetworkTask, string> = {
    'virtual-bridge': 'Virtual bridge (vmbr / vSwitch)',
    'port-group': 'Port group (VLAN segment)',
    'host-only-network': 'Host-only network',
    'nat-network': 'NAT network',
    'bridged-network': 'Bridged uplink network',
    'nic-bond': 'NIC bond / team',
    'sdn-zone': 'SDN zone (VXLAN / EVPN)',
    'macvtap-network': 'Macvtap passthrough',
    'sriov-network': 'SR-IOV virtual function',
    'ipvlan-network': 'IPvlan L3 network',
    'firewall-zone': 'Firewall zone',
  };
  return labels[task];
}

export function bridgeResourceName(config: VirtualBridgeConfig): string {
  if (config.kind === 'openvswitch') {
    return config.bridgeName.startsWith('br-') ? config.bridgeName : `br-${config.bridgeName}`;
  }
  return config.bridgeName.startsWith('vmbr') ? config.bridgeName : `vmbr${config.bridgeName.replace(/\D/g, '') || '0'}`;
}

export function buildVirtualBridgeManifest(config: VirtualBridgeConfig): string {
  if (config.kind === 'harvester-clusternetwork') {
    return YAML.stringify({
      apiVersion: 'network.harvesterhci.io/v1beta1',
      kind: 'ClusterNetwork',
      metadata: {
        name: config.name,
        labels: { 'nexus.nexus.io/bridge-kind': config.kind },
      },
    });
  }

  const bridge = bridgeResourceName(config);
  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `bridge-${config.name}`,
      namespace: 'nexus-system',
      labels: {
        'nexus.nexus.io/hypervisor-bridge': 'true',
        'nexus.nexus.io/bridge-kind': config.kind,
      },
    },
    data: {
      'spec.json': JSON.stringify({ ...config, bridgeName: bridge }, null, 2),
      'commands.txt': [
        config.kind === 'openvswitch'
          ? `ovs-vsctl --may-exist add-br ${bridge}`
          : `# ip link add name ${bridge} type bridge`,
        config.uplinkNic ? `# bridge uplink: ${config.uplinkNic}` : '# isolated bridge — no uplink',
        config.vlanAware ? `# bridge-vlan-aware yes (${bridge})` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  });
}

export function buildPortGroupNadManifest(config: PortGroupConfig, bridgeKind: VirtualBridgeKind = 'linux-bridge'): string {
  const bridge = config.bridge;
  const cniType = bridgeKind === 'openvswitch' ? 'ovs' : 'bridge';
  const cniConfig: Record<string, unknown> = {
    cniVersion: '0.3.1',
    name: config.name,
    type: cniType,
    bridge,
    vlan: config.vlanId,
    ipam: config.cidr ? { type: 'whereabouts', range: config.cidr, ...(config.gateway ? { gateway: config.gateway } : {}) } : {},
  };
  if (cniType === 'bridge') {
    cniConfig.promiscMode = true;
  }
  return YAML.stringify({
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: config.name,
      namespace: 'default',
      labels: {
        'nexus.nexus.io/port-group': 'true',
        'nexus.nexus.io/vlan-mode': config.vlanMode,
        'network.harvesterhci.io/vlan-id': String(config.vlanId),
        'network.harvesterhci.io/type': 'L2VlanNetwork',
      },
    },
    spec: { config: JSON.stringify(cniConfig, null, 2) },
  });
}

export function buildIsolatedNetworkManifest(config: IsolatedNetworkConfig): string {
  const bridge = config.bridge;
  const cniConfig: Record<string, unknown> = {
    cniVersion: '0.3.1',
    name: config.name,
    type: 'bridge',
    bridge,
    ipam: {
      type: 'host-local',
      subnet: config.cidr,
      gateway: config.gateway,
      routes: config.masquerade ? [{ dst: '0.0.0.0/0' }] : [],
    },
  };
  const docs: object[] = [
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `bridge-${bridge}`,
        namespace: 'nexus-system',
        labels: { 'nexus.nexus.io/hypervisor-bridge': 'true', 'nexus.nexus.io/isolated-network': config.kind },
      },
      data: {
        'spec.json': JSON.stringify({ name: bridge, kind: 'linux-bridge', bridgeName: bridge, isolated: true }, null, 2),
      },
    },
    {
      apiVersion: 'k8s.cni.cncf.io/v1',
      kind: 'NetworkAttachmentDefinition',
      metadata: {
        name: config.name,
        namespace: 'default',
        labels: {
          'nexus.nexus.io/isolated-network': config.kind,
          'nexus.nexus.io/bridge': bridge,
        },
      },
      spec: { config: JSON.stringify(cniConfig, null, 2) },
    },
  ];
  if (config.masquerade) {
    docs.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${config.name}-nat-egress`, namespace: 'default' },
      spec: {
        podSelector: { matchLabels: { 'nexus.nexus.io/network': config.name } },
        policyTypes: ['Egress'],
        egress: [{ to: [{ ipBlock: { cidr: '0.0.0.0/0' } }] }],
      },
    });
  }
  return docs.map((d) => YAML.stringify(d)).join('\n---\n');
}

export function buildNicBondManifest(config: NicBondConfig): string {
  return YAML.stringify({
    apiVersion: 'network.harvesterhci.io/v1beta1',
    kind: 'VlanConfig',
    metadata: { name: config.name, labels: { 'nexus.nexus.io/nic-bond': 'true' } },
    spec: {
      description: `Bond ${config.name} (${config.mode})`,
      clusterNetwork: config.bridge.replace(/^vmbr|^br-?/, '') || 'mgmt',
      uplink: {
        nics: config.slaves,
        bondOptions: {
          mode: config.mode === '802.3ad' ? '802.3ad' : config.mode === 'active-backup' ? 'active-backup' : 'balance-xor',
          miimon: config.miimon,
        },
      },
    },
  });
}

export function buildSdnZoneManifest(config: SdnZoneConfig): string {
  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `sdn-zone-${config.name}`,
      namespace: 'nexus-system',
      labels: {
        'nexus.nexus.io/sdn-zone': 'true',
        'nexus.nexus.io/zone-type': config.zoneType,
        'nexus.nexus.io/tenant': config.tenant,
      },
    },
    data: {
      'spec.json': JSON.stringify(config, null, 2),
      'commands.txt': [
        `ovs-vsctl --may-exist add-br br-${config.name}`,
        `ovs-vsctl add-port br-${config.name} vxlan-${config.vni} -- set interface vxlan-${config.vni} type=vxlan options:key=${config.vni}`,
      ].join('\n'),
    },
  });
}

export function buildPassthroughNadManifest(config: PassthroughNetworkConfig): string {
  let cniConfig: Record<string, unknown>;
  switch (config.kind) {
    case 'macvtap':
      cniConfig = {
        cniVersion: '0.3.1',
        name: config.name,
        type: 'macvtap',
        master: config.parentNic,
        mode: config.mode === 'l3' ? 'vepa' : 'bridge',
        ipam: {},
      };
      break;
    case 'ipvlan':
      cniConfig = {
        cniVersion: '0.3.1',
        name: config.name,
        type: 'ipvlan',
        master: config.parentNic,
        mode: config.mode ?? 'l2',
        ipam: {},
      };
      break;
    case 'sriov-vf':
      cniConfig = {
        cniVersion: '0.3.1',
        name: config.name,
        type: 'sriov',
        resourceName: config.sriovResourceName ?? 'intel.com/sriov_net',
        ipam: {},
      };
      break;
    default:
      cniConfig = { cniVersion: '0.3.1', name: config.name, type: 'host-device', device: config.parentNic, ipam: {} };
  }
  if (config.vlanId !== undefined && config.kind !== 'sriov-vf') {
    cniConfig.vlan = config.vlanId;
  }
  return YAML.stringify({
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: config.name,
      namespace: 'default',
      labels: {
        'nexus.nexus.io/passthrough': config.kind,
        'network.harvesterhci.io/type': 'Custom',
      },
    },
    spec: { config: JSON.stringify(cniConfig, null, 2) },
  });
}

export function buildFirewallZoneManifest(config: FirewallZoneConfig): string {
  const docs: object[] = [
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels: { 'nexus.nexus.io/firewall-zone': config.bridge },
      },
      spec: {
        podSelector: { matchLabels: { 'nexus.nexus.io/firewall-zone': config.name } },
        policyTypes: ['Ingress', 'Egress'],
        ingress:
          config.defaultPolicy === 'drop'
            ? config.allowedCidrs.map((cidr) => ({
                from: [{ ipBlock: { cidr } }],
                ports: config.allowedPorts.map((port) => ({ protocol: 'TCP', port })),
              }))
            : [{ from: [{ ipBlock: { cidr: '0.0.0.0/0' } }] }],
        egress: [{ to: [{ ipBlock: { cidr: '0.0.0.0/0' } }] }],
      },
    },
    {
      apiVersion: 'cilium.io/v2',
      kind: 'CiliumNetworkPolicy',
      metadata: { name: `${config.name}-cilium`, namespace: config.namespace },
      spec: {
        endpointSelector: { matchLabels: { 'nexus.nexus.io/firewall-zone': config.name } },
        ingress: config.defaultPolicy === 'drop' ? [{ fromEntities: ['cluster'] }] : [{ fromEntities: ['all'] }],
        egress: [{ toEntities: ['all'] }],
      },
    },
  ];
  return docs.map((d) => YAML.stringify(d)).join('\n---\n');
}

export function buildHypervisorNetworkManifest(task: HypervisorNetworkTask, config: HypervisorNetworkConfig): string {
  switch (task) {
    case 'virtual-bridge':
      return buildVirtualBridgeManifest(config.bridge);
    case 'port-group':
      return buildPortGroupNadManifest(config.portGroup, config.bridge.kind);
    case 'host-only-network':
      return buildIsolatedNetworkManifest({ ...config.isolated, kind: 'host-only', masquerade: false });
    case 'nat-network':
      return buildIsolatedNetworkManifest({ ...config.isolated, kind: 'nat', masquerade: true });
    case 'bridged-network':
      return [
        buildVirtualBridgeManifest({ ...config.bridge, kind: 'linux-bridge' }),
        buildNicBondManifest(config.bond),
      ].join('\n---\n');
    case 'nic-bond':
      return buildNicBondManifest(config.bond);
    case 'sdn-zone':
      return buildSdnZoneManifest(config.sdnZone);
    case 'macvtap-network':
      return buildPassthroughNadManifest({ ...config.passthrough, kind: 'macvtap' });
    case 'sriov-network':
      return buildPassthroughNadManifest({ ...config.passthrough, kind: 'sriov-vf' });
    case 'ipvlan-network':
      return buildPassthroughNadManifest({ ...config.passthrough, kind: 'ipvlan' });
    case 'firewall-zone':
      return buildFirewallZoneManifest(config.firewall);
  }
}

export function hypervisorNetworkCommands(task: HypervisorNetworkTask, config: HypervisorNetworkConfig): string[] {
  switch (task) {
    case 'virtual-bridge':
      return [`kubectl apply -f bridge-${config.bridge.name}.yaml`];
    case 'port-group':
      return [`kubectl apply -f ${config.portGroup.name}-portgroup-nad.yaml`];
    case 'host-only-network':
    case 'nat-network':
      return [`kubectl apply -f ${config.isolated.name}-isolated.yaml`];
    case 'bridged-network':
      return [`kubectl apply -f bridge-${config.bridge.name}.yaml`, `kubectl apply -f ${config.bond.name}-bond.yaml`];
    case 'nic-bond':
      return [`kubectl apply -f ${config.bond.name}-vlanconfig.yaml`];
    case 'sdn-zone':
      return [`kubectl apply -f sdn-zone-${config.sdnZone.name}.yaml`];
    case 'macvtap-network':
    case 'sriov-network':
    case 'ipvlan-network':
      return [`kubectl apply -f ${config.passthrough.name}-passthrough-nad.yaml`];
    case 'firewall-zone':
      return [`kubectl apply -f ${config.firewall.name}-firewall.yaml -n ${config.firewall.namespace}`];
  }
}

export const HYPERVISOR_NIC_MODELS: { id: HypervisorNicModel; label: string; hypervisor: string }[] = [
  { id: 'virtio', label: 'VirtIO (KVM / Proxmox default)', hypervisor: 'Proxmox, KVM, Harvester' },
  { id: 'e1000', label: 'Intel E1000', hypervisor: 'VMware, VirtualBox, Proxmox' },
  { id: 'e1000e', label: 'Intel E1000e', hypervisor: 'VMware, Proxmox' },
  { id: 'rtl8139', label: 'Realtek 8139', hypervisor: 'VirtualBox, legacy VMs' },
  { id: 'vmxnet3', label: 'VMXNET3 (virtio-equivalent)', hypervisor: 'VMware paravirtual' },
];

export function kubevirtModelForNic(model: HypervisorNicModel): string {
  return model === 'vmxnet3' ? 'virtio' : model;
}

export const ALL_NETWORK_TASK_GROUPS = {
  fabric: ['virtual-switch', 'virtual-bridge', 'ovs-bridge', 'nic-bond', 'bridged-network'] as const,
  segmentation: ['vlan', 'port-group', 'ovs-vlan', 'host-only-network', 'nat-network'] as const,
  overlay: ['vxlan-overlay', 'ovs-vxlan-tunnel', 'ovs-geneve-tunnel', 'sdn-zone'] as const,
  passthrough: ['macvtap-network', 'sriov-network', 'ipvlan-network'] as const,
  policy: ['tenant', 'zero-trust-policy', 'firewall-zone', 'ingress-route'] as const,
  ovs: ['ovs-port', 'ovs-bond', 'ovs-flow', 'ovs-mirror'] as const,
};

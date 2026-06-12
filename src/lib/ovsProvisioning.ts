import YAML from 'yaml';

/** Open vSwitch datapath, port, VLAN, tunnel, bond, and OpenFlow provisioning. */

export type OvsFailMode = 'standalone' | 'secure';
export type OvsDatapathType = 'system' | 'netdev';
export type OvsPortType = 'internal' | 'system' | 'patch' | 'vxlan' | 'geneve' | 'gre' | 'bond';
export type OvsVlanMode = 'access' | 'trunk' | 'dot1q-tunnel' | 'native-tagged' | 'native-untagged';
export type OvsBondMode = 'active-backup' | 'balance-slb' | 'balance-tcp';

export interface OvsBridgeConfig {
  name: string;
  failMode: OvsFailMode;
  datapathType: OvsDatapathType;
  protocols: string[];
  description?: string;
}

export interface OvsPortConfig {
  bridge: string;
  name: string;
  portType: OvsPortType;
  tag?: number;
  trunks?: number[];
  vlanMode?: OvsVlanMode;
  remoteIp?: string;
  localIp?: string;
  vni?: number;
  dstPort?: number;
  patchPeer?: string;
  nic?: string;
  mtu?: number;
}

export interface OvsBondConfig {
  bridge: string;
  name: string;
  slaves: string[];
  mode: OvsBondMode;
  lacp?: 'active' | 'passive' | 'off';
}

export interface OvsFlowConfig {
  bridge: string;
  table: number;
  priority: number;
  match: string;
  actions: string;
  idleTimeout?: number;
  hardTimeout?: number;
}

export interface OvsMirrorConfig {
  bridge: string;
  name: string;
  sourcePort: string;
  targetPort: string;
  selectAll?: boolean;
}

export type OvsProvisionTask =
  | 'ovs-bridge'
  | 'ovs-port'
  | 'ovs-vlan'
  | 'ovs-vxlan-tunnel'
  | 'ovs-geneve-tunnel'
  | 'ovs-bond'
  | 'ovs-flow'
  | 'ovs-mirror';

export interface OvsProvisionConfig {
  task: OvsProvisionTask;
  bridge: OvsBridgeConfig;
  port: OvsPortConfig;
  bond: OvsBondConfig;
  flow: OvsFlowConfig;
  mirror: OvsMirrorConfig;
}

export const NEXUS_OVS_NAMESPACE = 'nexus-system';
export const NEXUS_OVS_LABEL = 'nexus.nexus.io/ovs-managed';

export function buildDefaultOvsProvisionConfig(task: OvsProvisionTask = 'ovs-bridge'): OvsProvisionConfig {
  return {
    task,
    bridge: {
      name: 'br-tenant',
      failMode: 'standalone',
      datapathType: 'system',
      protocols: ['OpenFlow13', 'OpenFlow14'],
      description: 'Tenant OVS virtual switch',
    },
    port: {
      bridge: 'br-tenant',
      name: 'tenant-uplink',
      portType: 'system',
      nic: 'eth1',
      mtu: 1500,
    },
    bond: {
      bridge: 'br-tenant',
      name: 'bond0',
      slaves: ['eth1', 'eth2'],
      mode: 'active-backup',
      lacp: 'off',
    },
    flow: {
      bridge: 'br-tenant',
      table: 0,
      priority: 100,
      match: 'in_port=1,vlan_tci=0x0064/0x0fff',
      actions: 'normal',
    },
    mirror: {
      bridge: 'br-tenant',
      name: 'mirror-tenant',
      sourcePort: 'tenant-uplink',
      targetPort: 'mirror0',
      selectAll: false,
    },
  };
}

export function ovsBridgeCommands(config: OvsBridgeConfig): string[] {
  const cmds = [
    `ovs-vsctl --may-exist add-br ${config.name}`,
    `ovs-vsctl set bridge ${config.name} fail_mode=${config.failMode}`,
    `ovs-vsctl set bridge ${config.name} datapath_type=${config.datapathType}`,
  ];
  if (config.protocols.length > 0) {
    cmds.push(`ovs-vsctl set bridge ${config.name} protocols=${config.protocols.join(',')}`);
  }
  return cmds;
}

export function ovsPortCommands(config: OvsPortConfig): string[] {
  const cmds: string[] = [];
  switch (config.portType) {
    case 'internal':
      cmds.push(`ovs-vsctl --may-exist add-port ${config.bridge} ${config.name} -- set interface ${config.name} type=internal`);
      break;
    case 'system':
      cmds.push(`ovs-vsctl --may-exist add-port ${config.bridge} ${config.nic ?? config.name}`);
      break;
    case 'patch':
      cmds.push(
        `ovs-vsctl --may-exist add-port ${config.bridge} ${config.name} -- set interface ${config.name} type=patch options:peer=${config.patchPeer ?? 'patch-peer'}`,
      );
      break;
    case 'vxlan':
      cmds.push(
        `ovs-vsctl --may-exist add-port ${config.bridge} ${config.name} -- set interface ${config.name} type=vxlan options:remote_ip=${config.remoteIp ?? 'flow'} options:key=${config.vni ?? 0} options:dst_port=${config.dstPort ?? 4789}`,
      );
      if (config.localIp) {
        cmds.push(`ovs-vsctl set interface ${config.name} options:local_ip=${config.localIp}`);
      }
      break;
    case 'geneve':
      cmds.push(
        `ovs-vsctl --may-exist add-port ${config.bridge} ${config.name} -- set interface ${config.name} type=geneve options:remote_ip=${config.remoteIp ?? 'flow'} options:key=${config.vni ?? 0} options:dst_port=${config.dstPort ?? 6081}`,
      );
      break;
    case 'gre':
      cmds.push(
        `ovs-vsctl --may-exist add-port ${config.bridge} ${config.name} -- set interface ${config.name} type=gre options:remote_ip=${config.remoteIp ?? 'flow'} options:key=${config.vni ?? 0}`,
      );
      break;
    default:
      cmds.push(`ovs-vsctl --may-exist add-port ${config.bridge} ${config.name}`);
  }

  if (config.tag !== undefined) {
    cmds.push(`ovs-vsctl set port ${config.name} tag=${config.tag}`);
  }
  if (config.vlanMode) {
    cmds.push(`ovs-vsctl set port ${config.name} vlan_mode=${config.vlanMode}`);
  }
  if (config.trunks?.length) {
    cmds.push(`ovs-vsctl set port ${config.name} trunks=${config.trunks.join(',')}`);
  }
  if (config.mtu) {
    cmds.push(`ovs-vsctl set interface ${config.name} mtu_request=${config.mtu}`);
  }
  return cmds;
}

export function ovsBondCommands(config: OvsBondConfig): string[] {
  return [
    `ovs-vsctl --may-exist add-bond ${config.bridge} ${config.name} ${config.slaves.join(' ')}`,
    `ovs-vsctl set port ${config.name} bond_mode=${config.mode}`,
    ...(config.lacp ? [`ovs-vsctl set port ${config.name} lacp=${config.lacp}`] : []),
  ];
}

export function ovsFlowCommands(config: OvsFlowConfig): string[] {
  const idle = config.idleTimeout !== undefined ? `idle_timeout=${config.idleTimeout},` : '';
  const hard = config.hardTimeout !== undefined ? `hard_timeout=${config.hardTimeout},` : '';
  return [
    `ovs-ofctl -O OpenFlow13 add-flow ${config.bridge} "table=${config.table},priority=${config.priority},${idle}${hard}${config.match} actions=${config.actions}"`,
  ];
}

export function ovsMirrorCommands(config: OvsMirrorConfig): string[] {
  const select = config.selectAll ? 'select_all=true' : `select_src_port=${config.sourcePort}`;
  return [
    `ovs-vsctl -- --id=@m create mirror name=${config.name} ${select} output-port=${config.targetPort} -- set bridge ${config.bridge} mirrors=@m`,
  ];
}

export function buildOvsIntentConfigMap(
  kind: string,
  name: string,
  spec: Record<string, unknown>,
): string {
  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `ovs-${kind}-${name}`.slice(0, 253),
      namespace: NEXUS_OVS_NAMESPACE,
      labels: {
        [NEXUS_OVS_LABEL]: 'true',
        'nexus.nexus.io/ovs-kind': kind,
      },
    },
    data: {
      'spec.json': JSON.stringify(spec, null, 2),
      'commands.txt': buildOvsCommandsForTask(kind, spec).join('\n'),
    },
  });
}

function buildOvsCommandsForTask(kind: string, spec: Record<string, unknown>): string[] {
  switch (kind) {
    case 'bridge':
      return ovsBridgeCommands(spec as unknown as OvsBridgeConfig);
    case 'port':
    case 'vlan':
    case 'vxlan':
    case 'geneve':
      return ovsPortCommands(spec as unknown as OvsPortConfig);
    case 'bond':
      return ovsBondCommands(spec as unknown as OvsBondConfig);
    case 'flow':
      return ovsFlowCommands(spec as unknown as OvsFlowConfig);
    case 'mirror':
      return ovsMirrorCommands(spec as unknown as OvsMirrorConfig);
    default:
      return [];
  }
}

export function buildOvsVlanPortConfig(bridge: string, name: string, tag: number, vlanMode: OvsVlanMode = 'access'): OvsPortConfig {
  return {
    bridge,
    name,
    portType: 'internal',
    tag,
    vlanMode,
  };
}

export function buildOvsVxlanTunnelConfig(
  bridge: string,
  name: string,
  remoteIp: string,
  vni: number,
  localIp?: string,
): OvsPortConfig {
  return {
    bridge,
    name,
    portType: 'vxlan',
    remoteIp,
    localIp,
    vni,
    dstPort: 4789,
  };
}

export function buildOvsNadManifest(bridge: string, nadName: string, vlanId?: number, namespace = 'default'): string {
  const cniConfig: Record<string, unknown> = {
    cniVersion: '0.3.1',
    name: nadName,
    type: 'ovs',
    bridge,
    ipam: {},
  };
  if (vlanId !== undefined) {
    cniConfig.vlan = vlanId;
  }
  return YAML.stringify({
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: nadName,
      namespace,
      labels: {
        'nexus.nexus.io/ovs-bridge': bridge,
        'network.harvesterhci.io/type': 'L2VlanNetwork',
        ...(vlanId !== undefined ? { 'network.harvesterhci.io/vlan-id': String(vlanId) } : {}),
      },
    },
    spec: {
      config: JSON.stringify(cniConfig, null, 2),
    },
  });
}

export function buildOvsProvisionManifest(config: OvsProvisionConfig): string {
  const nsDoc = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: NEXUS_OVS_NAMESPACE, labels: { 'nexus.nexus.io/component': 'networking' } },
  };

  switch (config.task) {
    case 'ovs-bridge':
      return [YAML.stringify(nsDoc), buildOvsIntentConfigMap('bridge', config.bridge.name, config.bridge as unknown as Record<string, unknown>)].join('\n---\n');
    case 'ovs-port':
      return buildOvsIntentConfigMap('port', config.port.name, config.port as unknown as Record<string, unknown>);
    case 'ovs-vlan': {
      const vlanPort = buildOvsVlanPortConfig(config.port.bridge, config.port.name, config.port.tag ?? 100, config.port.vlanMode);
      return [
        buildOvsIntentConfigMap('vlan', vlanPort.name, vlanPort as unknown as Record<string, unknown>),
        buildOvsNadManifest(vlanPort.bridge, `${vlanPort.name}-nad`, vlanPort.tag),
      ].join('\n---\n');
    }
    case 'ovs-vxlan-tunnel': {
      const vxlan = { ...config.port, portType: 'vxlan' as const };
      return buildOvsIntentConfigMap('vxlan', vxlan.name, vxlan as unknown as Record<string, unknown>);
    }
    case 'ovs-geneve-tunnel': {
      const geneve = { ...config.port, portType: 'geneve' as const, dstPort: config.port.dstPort ?? 6081 };
      return buildOvsIntentConfigMap('geneve', geneve.name, geneve as unknown as Record<string, unknown>);
    }
    case 'ovs-bond':
      return buildOvsIntentConfigMap('bond', config.bond.name, config.bond as unknown as Record<string, unknown>);
    case 'ovs-flow':
      return buildOvsIntentConfigMap('flow', `${config.flow.bridge}-t${config.flow.table}-p${config.flow.priority}`, config.flow as unknown as Record<string, unknown>);
    case 'ovs-mirror':
      return buildOvsIntentConfigMap('mirror', config.mirror.name, config.mirror as unknown as Record<string, unknown>);
  }
}

export function ovsProvisionCommands(config: OvsProvisionConfig): string[] {
  switch (config.task) {
    case 'ovs-bridge':
      return ovsBridgeCommands(config.bridge);
    case 'ovs-port':
      return ovsPortCommands(config.port);
    case 'ovs-vlan':
      return ovsPortCommands(buildOvsVlanPortConfig(config.port.bridge, config.port.name, config.port.tag ?? 100, config.port.vlanMode));
    case 'ovs-vxlan-tunnel':
      return ovsPortCommands({ ...config.port, portType: 'vxlan' });
    case 'ovs-geneve-tunnel':
      return ovsPortCommands({ ...config.port, portType: 'geneve', dstPort: config.port.dstPort ?? 6081 });
    case 'ovs-bond':
      return ovsBondCommands(config.bond);
    case 'ovs-flow':
      return ovsFlowCommands(config.flow);
    case 'ovs-mirror':
      return ovsMirrorCommands(config.mirror);
  }
}

export function ovsProvisionTaskLabel(task: OvsProvisionTask): string {
  switch (task) {
    case 'ovs-bridge':
      return 'OVS virtual switch (bridge)';
    case 'ovs-port':
      return 'OVS port';
    case 'ovs-vlan':
      return 'OVS VLAN port';
    case 'ovs-vxlan-tunnel':
      return 'OVS VXLAN tunnel';
    case 'ovs-geneve-tunnel':
      return 'OVS Geneve tunnel';
    case 'ovs-bond':
      return 'OVS bond';
    case 'ovs-flow':
      return 'OpenFlow rule';
    case 'ovs-mirror':
      return 'OVS port mirror (SPAN)';
  }
}

export interface OvsBridgeRow {
  id: string;
  name: string;
  failMode: string;
  datapathType: string;
  portCount: number;
  flowCount: number;
  status: 'up' | 'degraded' | 'down';
}

export interface OvsPortRow {
  id: string;
  bridge: string;
  name: string;
  portType: string;
  tag?: number;
  rxMbps: number;
  txMbps: number;
  status: 'up' | 'down';
}

export interface OvsFlowRow {
  id: string;
  bridge: string;
  table: number;
  priority: number;
  match: string;
  actions: string;
}

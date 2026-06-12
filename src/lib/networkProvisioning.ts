import YAML from 'yaml';
import {
  buildDefaultHypervisorNetworkConfig,
  buildHypervisorNetworkManifest,
  hypervisorNetworkCommands,
  hypervisorTaskLabel,
  type HypervisorNetworkConfig,
  type HypervisorNetworkTask,
} from './hypervisorNetworking';
import {
  buildDefaultOvsProvisionConfig,
  buildOvsProvisionManifest,
  ovsProvisionCommands,
  type OvsProvisionConfig,
  type OvsProvisionTask,
} from './ovsProvisioning';

export type NetworkProvisionTask =
  | 'virtual-switch'
  | 'vlan'
  | 'vxlan-overlay'
  | 'tenant'
  | 'zero-trust-policy'
  | 'ingress-route'
  | OvsProvisionTask
  | HypervisorNetworkTask;

export type VirtualSwitchBackend = 'harvester-bridge' | 'openvswitch';

export type OverlayProtocol = 'vxlan' | 'geneve';

export interface VirtualSwitchConfig {
  name: string;
  description?: string;
  backend: VirtualSwitchBackend;
}

export interface VlanNetworkConfig {
  name: string;
  clusterNetwork: string;
  vlanId: number;
  cidr: string;
  gateway?: string;
  mode: 'auto' | 'manual';
  description?: string;
}

export interface VxlanOverlayConfig {
  name: string;
  clusterNetwork: string;
  protocol: OverlayProtocol;
  vni: number;
  cidr: string;
  gateway: string;
  tenant: string;
  port?: number;
}

export interface TenantNetworkConfig {
  tenantName: string;
  namespace: string;
  vlanIds: number[];
  clusterNetwork: string;
  defaultDeny: boolean;
  enableZeroTrust: boolean;
  resourceQuotaCpu: number;
  resourceQuotaMemoryGiB: number;
}

export interface ZeroTrustPolicyConfig {
  name: string;
  namespace: string;
  tenant: string;
  allowedNamespaces: string[];
  allowedCidrs: string[];
  allowedPorts: number[];
  useCilium: boolean;
  defaultDenyIngress: boolean;
  defaultDenyEgress: boolean;
}

export interface IngressRouteConfig {
  name: string;
  namespace: string;
  host: string;
  serviceName: string;
  servicePort: number;
  tlsSecret?: string;
  meshProvider: 'none' | 'istio' | 'linkerd' | 'cilium';
}

export interface NetworkProvisionConfig {
  task: NetworkProvisionTask;
  virtualSwitch: VirtualSwitchConfig;
  vlan: VlanNetworkConfig;
  overlay: VxlanOverlayConfig;
  tenant: TenantNetworkConfig;
  zeroTrust: ZeroTrustPolicyConfig;
  ingress: IngressRouteConfig;
  ovs: OvsProvisionConfig;
  hypervisor: HypervisorNetworkConfig;
}

const HARVESTER_NETWORK_GROUP = 'network.harvesterhci.io';

export function buildDefaultNetworkProvisionConfig(task: NetworkProvisionTask = 'vlan'): NetworkProvisionConfig {
  return {
    task,
    virtualSwitch: { name: 'br-tenant', description: 'OVS / L2 virtual switch for tenant VLANs', backend: 'openvswitch' },
    vlan: {
      name: 'tenant-vlan-100',
      clusterNetwork: 'mgmt',
      vlanId: 100,
      cidr: '10.20.100.0/24',
      gateway: '10.20.100.1',
      mode: 'auto',
      description: 'Tenant workload VLAN',
    },
    overlay: {
      name: 'vxlan-overlay-a',
      clusterNetwork: 'mgmt',
      protocol: 'vxlan',
      vni: 10001,
      cidr: '10.99.0.0/16',
      gateway: '10.99.0.1',
      tenant: 'tenant-a',
      port: 4789,
    },
    tenant: {
      tenantName: 'tenant-a',
      namespace: 'tenant-a',
      vlanIds: [100],
      clusterNetwork: 'mgmt',
      defaultDeny: true,
      enableZeroTrust: true,
      resourceQuotaCpu: 32,
      resourceQuotaMemoryGiB: 128,
    },
    zeroTrust: {
      name: 'zt-tenant-a',
      namespace: 'tenant-a',
      tenant: 'tenant-a',
      allowedNamespaces: ['tenant-a'],
      allowedCidrs: ['10.20.100.0/24'],
      allowedPorts: [443, 6443],
      useCilium: true,
      defaultDenyIngress: true,
      defaultDenyEgress: true,
    },
    ingress: {
      name: 'tenant-a-ingress',
      namespace: 'tenant-a',
      host: 'tenant-a.apps.cluster.local',
      serviceName: 'tenant-a-svc',
      servicePort: 443,
      meshProvider: 'cilium',
    },
    ovs: buildDefaultOvsProvisionConfig(task.startsWith('ovs-') ? (task as OvsProvisionTask) : 'ovs-bridge'),
    hypervisor: buildDefaultHypervisorNetworkConfig(
      task === 'port-group' || task === 'virtual-bridge' || task.startsWith('host-') || task === 'nat-network'
        ? (task as HypervisorNetworkTask)
        : 'virtual-bridge',
    ),
  };
}

function bridgeName(clusterNetwork: string): string {
  return `${clusterNetwork}-br`;
}

export function buildClusterNetworkManifest(config: VirtualSwitchConfig): string {
  return YAML.stringify({
    apiVersion: `${HARVESTER_NETWORK_GROUP}/v1beta1`,
    kind: 'ClusterNetwork',
    metadata: { name: config.name },
  });
}

export function buildVlanConfigManifest(config: VlanNetworkConfig): string {
  return YAML.stringify({
    apiVersion: `${HARVESTER_NETWORK_GROUP}/v1beta1`,
    kind: 'VlanConfig',
    metadata: { name: config.name },
    spec: {
      description: config.description ?? `Uplink for VLAN ${config.vlanId}`,
      clusterNetwork: config.clusterNetwork,
      uplink: {
        nics: ['eth1'],
        linkAttributes: { mtu: 1500 },
        bondOptions: { mode: 'active-backup', miimon: 100 },
      },
    },
  });
}

export function buildVlanNadManifest(config: VlanNetworkConfig, options?: { ovsBridge?: string }): string {
  const ovsBridge = options?.ovsBridge ?? bridgeName(config.clusterNetwork);
  const useOvs = Boolean(options?.ovsBridge);
  const networkConf = {
    mode: config.mode,
    cidr: config.cidr,
    gateway: config.gateway ?? '',
    connectivity: 'true',
  };
  const cniConfig = useOvs
    ? {
        cniVersion: '0.3.1',
        name: config.name,
        type: 'ovs',
        bridge: ovsBridge,
        vlan: config.vlanId,
        ipam: {},
      }
    : {
        cniVersion: '0.3.1',
        name: config.name,
        type: 'bridge',
        bridge: bridgeName(config.clusterNetwork),
        promiscMode: true,
        vlan: config.vlanId,
        ipam: {},
      };
  return YAML.stringify({
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: config.name,
      namespace: 'default',
      labels: {
        [`${HARVESTER_NETWORK_GROUP}/clusternetwork`]: config.clusterNetwork,
        [`${HARVESTER_NETWORK_GROUP}/vlan-id`]: String(config.vlanId),
        [`${HARVESTER_NETWORK_GROUP}/type`]: 'L2VlanNetwork',
        'nexus.nexus.io/tenant': config.name.split('-')[0] ?? 'shared',
        ...(useOvs ? { 'nexus.nexus.io/ovs-bridge': ovsBridge } : {}),
      },
      annotations: {
        [`${HARVESTER_NETWORK_GROUP}/networkconf`]: JSON.stringify(networkConf),
      },
    },
    spec: {
      config: JSON.stringify(cniConfig, null, 2),
    },
  });
}

export function buildVxlanOverlayManifest(config: VxlanOverlayConfig): string {
  const overlayPort = config.port ?? (config.protocol === 'geneve' ? 6081 : 4789);
  const cniType = config.protocol === 'geneve' ? 'geneve' : 'vxlan';
  const cniConfig = {
    cniVersion: '0.3.1',
    name: config.name,
    type: cniType,
    vni: config.vni,
    port: overlayPort,
    mtu: 1450,
    ipam: {
      type: 'whereabouts',
      range: config.cidr,
      gateway: config.gateway,
    },
  };
  const networkConf = {
    mode: 'manual',
    cidr: config.cidr,
    gateway: config.gateway,
    connectivity: 'true',
  };
  return YAML.stringify({
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: config.name,
      namespace: 'default',
      labels: {
        [`${HARVESTER_NETWORK_GROUP}/clusternetwork`]: config.clusterNetwork,
        [`${HARVESTER_NETWORK_GROUP}/type`]: 'OverlayNetwork',
        'nexus.nexus.io/overlay-protocol': config.protocol,
        'nexus.nexus.io/tenant': config.tenant,
        'nexus.nexus.io/vni': String(config.vni),
      },
      annotations: {
        [`${HARVESTER_NETWORK_GROUP}/networkconf`]: JSON.stringify(networkConf),
      },
    },
    spec: {
      config: JSON.stringify(cniConfig, null, 2),
    },
  });
}

export function buildTenantNamespaceManifest(config: TenantNetworkConfig): string {
  const docs: object[] = [
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: config.namespace,
        labels: {
          'nexus.nexus.io/tenant': config.tenantName,
          'nexus.nexus.io/clusternetwork': config.clusterNetwork,
          'pod-security.kubernetes.io/enforce': 'baseline',
        },
        annotations: {
          'nexus.nexus.io/vlan-ids': config.vlanIds.join(','),
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: { name: `${config.namespace}-quota`, namespace: config.namespace },
      spec: {
        hard: {
          'limits.cpu': String(config.resourceQuotaCpu),
          'limits.memory': `${config.resourceQuotaMemoryGiB}Gi`,
          pods: '200',
        },
      },
    },
  ];

  if (config.defaultDeny) {
    docs.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${config.namespace}-default-deny`, namespace: config.namespace },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
      },
    });
  }

  if (config.enableZeroTrust) {
    docs.push({
      apiVersion: 'cilium.io/v2',
      kind: 'CiliumNetworkPolicy',
      metadata: { name: `${config.namespace}-zero-trust`, namespace: config.namespace },
      spec: {
        endpointSelector: { matchLabels: { 'nexus.nexus.io/tenant': config.tenantName } },
        ingress: [{ fromEntities: ['cluster'] }],
        egress: [
          { toEntities: ['cluster'] },
          { toEntities: ['kube-apiserver'] },
        ],
      },
    });
  }

  return docs.map((doc) => YAML.stringify(doc)).join('\n---\n');
}

export function buildZeroTrustPolicyManifest(config: ZeroTrustPolicyConfig): string {
  if (config.useCilium) {
    const ingressFrom = config.allowedNamespaces.map((ns) => ({
      fromEndpoints: [{ matchLabels: { 'kubernetes.io/metadata.name': ns } }],
    }));
    const egressTo = [
      ...config.allowedNamespaces.map((ns) => ({
        toEndpoints: [{ matchLabels: { 'kubernetes.io/metadata.name': ns } }],
      })),
      ...config.allowedCidrs.map((cidr) => ({
        toCIDR: [cidr],
      })),
    ];
    if (config.allowedPorts.length > 0) {
      for (const rule of egressTo) {
        Object.assign(rule, {
          toPorts: [{ ports: config.allowedPorts.map((port) => ({ port: String(port), protocol: 'TCP' })) }],
        });
      }
    }
    return YAML.stringify({
      apiVersion: 'cilium.io/v2',
      kind: 'CiliumNetworkPolicy',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels: {
          'nexus.nexus.io/zero-trust': 'true',
          'nexus.nexus.io/tenant': config.tenant,
        },
      },
      spec: {
        endpointSelector: { matchLabels: { 'nexus.nexus.io/tenant': config.tenant } },
        ingress: config.defaultDenyIngress ? ingressFrom : [{ fromEntities: ['all'] }],
        egress: config.defaultDenyEgress ? egressTo : [{ toEntities: ['all'] }],
      },
    });
  }

  return YAML.stringify({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: { 'nexus.nexus.io/zero-trust': 'true', 'nexus.nexus.io/tenant': config.tenant },
    },
    spec: {
      podSelector: { matchLabels: { 'nexus.nexus.io/tenant': config.tenant } },
      policyTypes: ['Ingress', 'Egress'],
      ingress: config.allowedNamespaces.map((ns) => ({
        from: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': ns } } }],
      })),
      egress: [
        {
          to: config.allowedCidrs.map((cidr) => ({ ipBlock: { cidr } })),
          ports: config.allowedPorts.map((port) => ({ protocol: 'TCP', port })),
        },
      ],
    },
  });
}

export function buildIngressRouteManifest(config: IngressRouteConfig): string {
  const docs: object[] = [
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels: {
          'nexus.nexus.io/mesh': config.meshProvider,
          'nexus.nexus.io/tenant': config.namespace,
        },
        annotations: {
          'kubernetes.io/ingress.class': 'nginx',
          ...(config.tlsSecret ? { 'cert-manager.io/cluster-issuer': 'letsencrypt-prod' } : {}),
        },
      },
      spec: {
        ...(config.tlsSecret
          ? {
              tls: [{ hosts: [config.host], secretName: config.tlsSecret }],
            }
          : {}),
        rules: [
          {
            host: config.host,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: config.serviceName,
                      port: { number: config.servicePort },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ];

  if (config.meshProvider === 'istio') {
    docs.push({
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'Gateway',
      metadata: { name: `${config.name}-gw`, namespace: config.namespace },
      spec: {
        selector: { istio: 'ingressgateway' },
        servers: [{ port: { number: 443, name: 'https', protocol: 'HTTPS' }, hosts: [config.host] }],
      },
    });
  }

  return docs.map((doc) => YAML.stringify(doc)).join('\n---\n');
}

export function buildNetworkProvisionManifest(
  config: NetworkProvisionConfig,
  options?: { live?: boolean },
): string {
  void options;
  if (config.task.startsWith('ovs-')) {
    return buildOvsProvisionManifest(config.ovs);
  }
  const hypervisorTasks: HypervisorNetworkTask[] = [
    'virtual-bridge', 'port-group', 'host-only-network', 'nat-network', 'bridged-network',
    'nic-bond', 'sdn-zone', 'macvtap-network', 'sriov-network', 'ipvlan-network', 'firewall-zone',
  ];
  if (hypervisorTasks.includes(config.task as HypervisorNetworkTask)) {
    return buildHypervisorNetworkManifest(config.task as HypervisorNetworkTask, config.hypervisor);
  }
  switch (config.task) {
    case 'virtual-switch':
      if (config.virtualSwitch.backend === 'openvswitch') {
        const ovsConfig = buildDefaultOvsProvisionConfig('ovs-bridge');
        ovsConfig.bridge.name = config.virtualSwitch.name.startsWith('br-')
          ? config.virtualSwitch.name
          : `br-${config.virtualSwitch.name}`;
        ovsConfig.bridge.description = config.virtualSwitch.description;
        return buildOvsProvisionManifest(ovsConfig);
      }
      return buildClusterNetworkManifest(config.virtualSwitch);
    case 'vlan':
      return [
        buildVlanConfigManifest(config.vlan),
        buildVlanNadManifest(config.vlan, {
          ovsBridge: config.virtualSwitch.backend === 'openvswitch' ? config.virtualSwitch.name : undefined,
        }),
      ].join('\n---\n');
    case 'vxlan-overlay':
      return buildVxlanOverlayManifest(config.overlay);
    case 'tenant':
      return buildTenantNamespaceManifest(config.tenant);
    case 'zero-trust-policy':
      return buildZeroTrustPolicyManifest(config.zeroTrust);
    case 'ingress-route':
      return buildIngressRouteManifest(config.ingress);
    default:
      return '';
  }
}

export function networkProvisionCommands(config: NetworkProvisionConfig): string[] {
  if (config.task.startsWith('ovs-')) {
    return ovsProvisionCommands(config.ovs);
  }
  const hypervisorTasks: HypervisorNetworkTask[] = [
    'virtual-bridge', 'port-group', 'host-only-network', 'nat-network', 'bridged-network',
    'nic-bond', 'sdn-zone', 'macvtap-network', 'sriov-network', 'ipvlan-network', 'firewall-zone',
  ];
  if (hypervisorTasks.includes(config.task as HypervisorNetworkTask)) {
    return hypervisorNetworkCommands(config.task as HypervisorNetworkTask, config.hypervisor);
  }
  switch (config.task) {
    case 'virtual-switch':
      if (config.virtualSwitch.backend === 'openvswitch') {
        return ovsProvisionCommands({
          ...config.ovs,
          task: 'ovs-bridge',
          bridge: {
            ...config.ovs.bridge,
            name: config.virtualSwitch.name.startsWith('br-') ? config.virtualSwitch.name : `br-${config.virtualSwitch.name}`,
          },
        });
      }
      return [`kubectl apply -f ${config.virtualSwitch.name}-clusternetwork.yaml`];
    case 'vlan':
      return [
        `kubectl apply -f ${config.vlan.name}-vlanconfig.yaml`,
        `kubectl apply -f ${config.vlan.name}-nad.yaml`,
      ];
    case 'vxlan-overlay':
      return [`kubectl apply -f ${config.overlay.name}-overlay-nad.yaml`];
    case 'tenant':
      return [`kubectl apply -f ${config.tenant.namespace}-tenant.yaml`];
    case 'zero-trust-policy':
      return [`kubectl apply -f ${config.zeroTrust.name}-policy.yaml -n ${config.zeroTrust.namespace}`];
    case 'ingress-route':
      return [`kubectl apply -f ${config.ingress.name}-ingress.yaml -n ${config.ingress.namespace}`];
    default:
      return [];
  }
}

export function networkProvisionTaskLabel(task: NetworkProvisionTask): string {
  if (task.startsWith('ovs-')) {
    const labels: Record<string, string> = {
      'ovs-bridge': 'OVS virtual switch',
      'ovs-port': 'OVS port',
      'ovs-vlan': 'OVS VLAN',
      'ovs-vxlan-tunnel': 'OVS VXLAN tunnel',
      'ovs-geneve-tunnel': 'OVS Geneve tunnel',
      'ovs-bond': 'OVS bond',
      'ovs-flow': 'OpenFlow rule',
      'ovs-mirror': 'OVS SPAN mirror',
    };
    return labels[task] ?? task;
  }
  const hypervisorLabels: Partial<Record<HypervisorNetworkTask, string>> = {
    'virtual-bridge': hypervisorTaskLabel('virtual-bridge'),
    'port-group': hypervisorTaskLabel('port-group'),
    'host-only-network': hypervisorTaskLabel('host-only-network'),
    'nat-network': hypervisorTaskLabel('nat-network'),
    'bridged-network': hypervisorTaskLabel('bridged-network'),
    'nic-bond': hypervisorTaskLabel('nic-bond'),
    'sdn-zone': hypervisorTaskLabel('sdn-zone'),
    'macvtap-network': hypervisorTaskLabel('macvtap-network'),
    'sriov-network': hypervisorTaskLabel('sriov-network'),
    'ipvlan-network': hypervisorTaskLabel('ipvlan-network'),
    'firewall-zone': hypervisorTaskLabel('firewall-zone'),
  };
  if (hypervisorLabels[task as HypervisorNetworkTask]) {
    return hypervisorLabels[task as HypervisorNetworkTask]!;
  }
  switch (task) {
    case 'virtual-switch':
      return 'Virtual switch (Harvester / OVS)';
    case 'vlan':
      return 'VLAN network';
    case 'vxlan-overlay':
      return 'VXLAN / Geneve overlay';
    case 'tenant':
      return 'Multi-tenant namespace';
    case 'zero-trust-policy':
      return 'Zero-trust policy';
    case 'ingress-route':
      return 'Ingress route';
    default:
      return String(task);
  }
}

export { ALL_NETWORK_TASK_GROUPS } from './hypervisorNetworking';

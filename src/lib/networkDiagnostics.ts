import type {
  IngressRoute,
  NetworkPolicyCell,
  NetworkingDashboard,
  VlanLane,
} from './dashboards';

export type DiagnosticSeverity = 'ok' | 'warning' | 'critical' | 'info';

export interface NetworkDiagnosticCheck {
  id: string;
  label: string;
  detail: string;
  severity: DiagnosticSeverity;
  target?: string;
}

export interface LiveNetworkingDiagnosticsInput {
  virtualSwitchCount: number;
  readySwitchCount: number;
  vlanCount: number;
  readyVlanCount: number;
  overlayCount: number;
  tenantCount: number;
  policyAllowCount: number;
  policyDenyCount: number;
  ingressCount: number;
  nadReadyCount: number;
  nadTotal: number;
  ciliumEnabled: boolean;
  multusEnabled: boolean;
  ovsAvailable?: boolean;
  ovsBridgeCount?: number;
  ovsFlowCount?: number;
}

export function runNetworkDiagnostics(input: LiveNetworkingDiagnosticsInput): NetworkDiagnosticCheck[] {
  const checks: NetworkDiagnosticCheck[] = [];

  checks.push({
    id: 'switches',
    label: 'Virtual switches',
    detail:
      input.virtualSwitchCount === 0
        ? 'No ClusterNetwork resources — create a virtual switch before VLANs.'
        : `${input.readySwitchCount}/${input.virtualSwitchCount} ClusterNetworks ready`,
    severity:
      input.virtualSwitchCount === 0
        ? 'warning'
        : input.readySwitchCount < input.virtualSwitchCount
          ? 'critical'
          : 'ok',
  });

  checks.push({
    id: 'vlans',
    label: 'VLAN fabric',
    detail:
      input.vlanCount === 0
        ? 'No VLAN NADs detected — workloads use default pod network only.'
        : `${input.readyVlanCount}/${input.vlanCount} VLAN networks ready`,
    severity: input.vlanCount === 0 ? 'info' : input.readyVlanCount < input.vlanCount ? 'warning' : 'ok',
  });

  checks.push({
    id: 'overlays',
    label: 'Overlay networks',
    detail:
      input.overlayCount === 0
        ? 'No VXLAN/Geneve overlays configured.'
        : `${input.overlayCount} overlay NAD(s) active`,
    severity: input.overlayCount === 0 ? 'info' : 'ok',
  });

  checks.push({
    id: 'nads',
    label: 'Multus attachments',
    detail:
      input.nadTotal === 0
        ? 'Multus NAD inventory empty.'
        : `${input.nadReadyCount}/${input.nadTotal} NADs marked ready`,
    severity:
      input.nadTotal > 0 && input.nadReadyCount < input.nadTotal
        ? 'warning'
        : input.multusEnabled
          ? 'ok'
          : 'info',
  });

  checks.push({
    id: 'tenants',
    label: 'Tenant isolation',
    detail:
      input.tenantCount === 0
        ? 'No tenant namespaces with nexus.nexus.io/tenant label.'
        : `${input.tenantCount} tenant namespace(s) with quotas/policies`,
    severity: input.tenantCount === 0 ? 'warning' : 'ok',
  });

  checks.push({
    id: 'zero-trust',
    label: 'Zero-trust posture',
    detail: `${input.policyAllowCount} allow · ${input.policyDenyCount} deny policy rules indexed`,
    severity:
      input.policyDenyCount === 0 && input.policyAllowCount === 0
        ? 'critical'
        : input.policyDenyCount > 0
          ? 'ok'
          : 'warning',
  });

  checks.push({
    id: 'ingress',
    label: 'Ingress & mesh routes',
    detail:
      input.ingressCount === 0
        ? 'No Ingress resources in user namespaces.'
        : `${input.ingressCount} ingress route(s) published`,
    severity: input.ingressCount === 0 ? 'info' : 'ok',
  });

  checks.push({
    id: 'cilium',
    label: 'Cilium dataplane',
    detail: input.ciliumEnabled
      ? 'Cilium CNI detected — Hubble-ready zero-trust policies supported.'
      : 'Cilium not detected — using Kubernetes NetworkPolicy only.',
    severity: input.ciliumEnabled ? 'ok' : 'info',
  });

  checks.push({
    id: 'openvswitch',
    label: 'Open vSwitch',
    detail: input.ovsAvailable
      ? `${input.ovsBridgeCount ?? 0} OVS bridge(s) · ${input.ovsFlowCount ?? 0} OpenFlow rule(s) loaded`
      : 'OVS not detected on node — virtual switches use Linux bridge / Harvester ClusterNetwork fallback.',
    severity: input.ovsAvailable ? 'ok' : 'info',
  });

  return checks;
}

export function diagnosticsFromNetworkingDashboard(
  dashboard: NetworkingDashboard,
  meta?: Partial<LiveNetworkingDiagnosticsInput>,
): NetworkDiagnosticCheck[] {
  const vlanReady = dashboard.vlans.filter((vlan) => vlan.pods + vlan.vms >= 0).length;
  return runNetworkDiagnostics({
    virtualSwitchCount: meta?.virtualSwitchCount ?? Math.max(1, new Set(dashboard.vlans.map((v) => v.name)).size),
    readySwitchCount: meta?.readySwitchCount ?? Math.max(1, dashboard.topology.nodes.length > 0 ? 1 : 0),
    vlanCount: dashboard.vlans.length,
    readyVlanCount: meta?.readyVlanCount ?? vlanReady,
    overlayCount: meta?.overlayCount ?? 0,
    tenantCount: meta?.tenantCount ?? dashboard.vlans.filter((v) => v.name.includes('tenant')).length,
    policyAllowCount: dashboard.policyMatrix.filter((cell) => cell.allow).length,
    policyDenyCount: dashboard.policyMatrix.filter((cell) => !cell.allow).length,
    ingressCount: dashboard.ingressRoutes.length,
    nadReadyCount: meta?.nadReadyCount ?? dashboard.vlans.length,
    nadTotal: meta?.nadTotal ?? dashboard.vlans.length,
    ciliumEnabled: meta?.ciliumEnabled ?? dashboard.ingressRoutes.some((r) => r.meshProvider === 'cilium'),
    multusEnabled: meta?.multusEnabled ?? true,
  });
}

export function emptyLiveNetworkingSlice(): Pick<
  NetworkingDashboard,
  'vlans' | 'ingressRoutes' | 'policyMatrix' | 'nicBonds' | 'virtualSwitches' | 'overlays' | 'tenants' | 'diagnostics'
> {
  return {
    vlans: [],
    ingressRoutes: [],
    policyMatrix: [],
    nicBonds: [],
    virtualSwitches: [],
    overlays: [],
    tenants: [],
    diagnostics: [],
  };
}

export type { VlanLane, IngressRoute, NetworkPolicyCell };

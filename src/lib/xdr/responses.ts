/**
 * Response-action generators.
 *
 * Each `build*` function returns a `ResponseAction` whose `manifest` is the
 * actual Kubernetes YAML (or `kubectl` command) that an operator can apply
 * directly — no further hand-editing required. This is what closes the loop
 * between detection and remediation.
 */

import YAML from 'yaml';
import type { Alert, ResponseAction, ResponseActionKind } from './types';

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Cilium NetworkPolicy that isolates a pod by name + namespace. */
export function buildIsolateEndpoint(alert: Alert, namespace = 'default'): ResponseAction {
  const podName = alert.endpointId;
  const yaml = YAML.stringify({
    apiVersion: 'cilium.io/v2',
    kind: 'CiliumNetworkPolicy',
    metadata: {
      name: `nexus-xdr-isolate-${podName}`,
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'nexus-xdr',
        'nexus.xdr/alert-id': alert.id,
      },
    },
    spec: {
      endpointSelector: { matchLabels: { 'k8s:io.kubernetes.pod.name': podName } },
      ingress: [], // deny all ingress
      egress: [],  // deny all egress
    },
  });
  return {
    id: newId('isol'),
    kind: 'isolate-endpoint',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `Cilium NetworkPolicy denies all ingress/egress for ${podName}`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** kubectl cordon + drain the host (uses Harvester live-migration to evacuate). */
export function buildQuarantineHost(alert: Alert): ResponseAction {
  const host = alert.endpointId;
  const yaml = [
    `# Cordon and drain Harvester host ${host}, evacuating workloads via live migration.`,
    `kubectl cordon ${host}`,
    `kubectl drain ${host} --ignore-daemonsets --delete-emptydir-data --force --grace-period=120`,
    `# Schedule a kube-bench scan of the cordoned host before re-admission`,
    `kubectl annotate node ${host} nexus.xdr/quarantine-reason="${alert.ruleId}" nexus.xdr/alert-id="${alert.id}"`,
  ].join('\n');
  return {
    id: newId('quar'),
    kind: 'quarantine-host',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `Cordon + drain ${host} (live-migrate workloads to peers)`,
    requiresApproval: true,
    status: 'pending',
  };
}

/** Take a Longhorn / KubeVirt snapshot before isolation. */
export function buildSnapshotVm(alert: Alert, namespace = 'default'): ResponseAction {
  const vmName = alert.endpointId;
  const yaml = YAML.stringify({
    apiVersion: 'snapshot.kubevirt.io/v1beta1',
    kind: 'VirtualMachineSnapshot',
    metadata: {
      name: `nexus-xdr-snap-${vmName}-${Date.now()}`,
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'nexus-xdr',
        'nexus.xdr/alert-id': alert.id,
      },
    },
    spec: { source: { apiGroup: 'kubevirt.io', kind: 'VirtualMachine', name: vmName } },
  });
  return {
    id: newId('snap'),
    kind: 'snapshot-vm',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `KubeVirt VirtualMachineSnapshot of ${vmName} (Longhorn backing)`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** `incus snapshot` for system containers. */
export function buildSnapshotLxc(alert: Alert): ResponseAction {
  const name = alert.endpointId;
  const cmd = `incus snapshot create ${name} nexus-xdr-${Date.now()} --reuse --stateful=false`;
  return {
    id: newId('lxsnap'),
    kind: 'snapshot-lxc',
    endpointId: alert.endpointId,
    manifest: cmd,
    summary: `Incus snapshot of system container ${name}`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** Tetragon TracingPolicy that SIGKILLs a specific process binary on a node. */
export function buildKillProcess(alert: Alert): ResponseAction {
  const binary = alert.triggeringEvent.process ?? 'unknown';
  const yaml = YAML.stringify({
    apiVersion: 'cilium.io/v1alpha1',
    kind: 'TracingPolicy',
    metadata: {
      name: `nexus-xdr-kill-${binary.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now()}`,
      labels: { 'app.kubernetes.io/managed-by': 'nexus-xdr', 'nexus.xdr/alert-id': alert.id },
    },
    spec: {
      kprobes: [
        {
          call: 'sys_execve',
          syscall: true,
          args: [{ index: 0, type: 'string' }],
          selectors: [
            {
              matchArgs: [{ index: 0, operator: 'Postfix', values: [binary] }],
              matchActions: [{ action: 'Sigkill' }],
            },
          ],
        },
      ],
    },
  });
  return {
    id: newId('kill'),
    kind: 'kill-process',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `Tetragon TracingPolicy SIGKILLs any future exec of "${binary}"`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** ArgoCD rollback to the last-known-good revision. */
export function buildRollbackDeployment(alert: Alert, app = 'app', revision = 'last-known-good'): ResponseAction {
  const cmd = [
    `# Rollback ${app} to ${revision} via ArgoCD`,
    `argocd app rollback ${app} ${revision} --prune`,
    `kubectl annotate application/${app} -n argocd nexus.xdr/rollback-reason="${alert.ruleId}" nexus.xdr/alert-id="${alert.id}"`,
  ].join('\n');
  return {
    id: newId('rb'),
    kind: 'rollback-deployment',
    endpointId: alert.endpointId,
    manifest: cmd,
    summary: `ArgoCD rolls ${app} back to ${revision}`,
    requiresApproval: true,
    status: 'pending',
  };
}

/** Block a known-bad image at the Trivy admission webhook. */
export function buildBlockImage(alert: Alert, image: string): ResponseAction {
  const yaml = YAML.stringify({
    apiVersion: 'aquasecurity.github.io/v1alpha1',
    kind: 'ClusterVulnerabilityException',
    metadata: { name: `nexus-xdr-block-${Date.now()}` },
    spec: { image, reason: alert.ruleId, denyAction: 'reject' },
  });
  return {
    id: newId('block-img'),
    kind: 'block-image',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `Trivy admission webhook rejects future pulls of ${image}`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** Block egress to a domain at the Cilium DNS layer. */
export function buildBlockEgressDomain(alert: Alert, domain: string, namespace = 'default'): ResponseAction {
  const yaml = YAML.stringify({
    apiVersion: 'cilium.io/v2',
    kind: 'CiliumClusterwideNetworkPolicy',
    metadata: { name: `nexus-xdr-block-${domain.replace(/[^a-z0-9-]/g, '-')}-${Date.now()}` },
    spec: {
      endpointSelector: {},
      egress: [{ toFQDNs: [{ matchName: domain }], toPorts: [{ rules: { dns: [{ matchPattern: '*' }] } }] }],
      egressDeny: [{ toFQDNs: [{ matchName: domain }] }],
    },
  });
  return {
    id: newId('egress'),
    kind: 'block-egress-domain',
    endpointId: alert.endpointId,
    manifest: yaml,
    summary: `Cilium cluster-wide deny of egress to ${domain}`,
    requiresApproval: false,
    status: 'pending',
  };
}

/** Generic alert-only (no enforcement). */
export function buildAlertOnly(alert: Alert): ResponseAction {
  return {
    id: newId('alert'),
    kind: 'alert-only',
    endpointId: alert.endpointId,
    manifest: `# Alert ${alert.id} (${alert.ruleId}) recorded; no auto-mitigation requested.`,
    summary: 'Alert logged to Wazuh + OpenSearch — no enforcement',
    requiresApproval: false,
    status: 'pending',
  };
}

/** Dispatch the recommended action for an alert. */
export function buildResponseForAlert(alert: Alert, kind: ResponseActionKind): ResponseAction {
  switch (kind) {
    case 'isolate-endpoint':
      return buildIsolateEndpoint(alert);
    case 'quarantine-host':
      return buildQuarantineHost(alert);
    case 'snapshot-vm':
      return buildSnapshotVm(alert);
    case 'snapshot-lxc':
      return buildSnapshotLxc(alert);
    case 'kill-process':
      return buildKillProcess(alert);
    case 'rollback-deployment':
      return buildRollbackDeployment(alert);
    case 'rotate-token':
      return {
        id: newId('rot'),
        kind: 'rotate-token',
        endpointId: alert.endpointId,
        manifest: `# Rotate cluster token via Harvester install adapter\nharvester-cli token rotate --reason ${alert.ruleId}`,
        summary: 'Rotate cluster service-account token',
        requiresApproval: true,
        status: 'pending',
      };
    case 'block-image':
      return buildBlockImage(alert, (alert.triggeringEvent.payload['image'] as string) || 'unknown:latest');
    case 'block-egress-domain':
      return buildBlockEgressDomain(alert, alert.triggeringEvent.remoteHost ?? 'unknown.example');
    case 'alert-only':
    default:
      return buildAlertOnly(alert);
  }
}

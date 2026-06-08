import type { ApplicationConfig } from '../types';
import type { HarvesterMachineConfig, HarvesterMachineInstallPlan } from './harvesterMachineWizard';
import type { ValidationResult } from './clusterWorkflow';
import YAML from 'yaml';

export type DeployTarget = 'cluster' | 'join-cluster' | 'workload' | 'vm' | 'lxc' | 'pod';

export type PolyComputeWorkloadKind = 'kubevirt-vm' | 'incus-lxc' | 'k8s-pod';

export interface WorkloadCreateConfig {
  kind: PolyComputeWorkloadKind;
  name: string;
  namespace: string;
  cpuCores: number;
  memoryGiB: number;
  image: string;
  enableHa: boolean;
  hostAffinity: string;
}

export interface DeployPhase {
  label: string;
  detail: string;
}

export interface DeployResult {
  success: boolean;
  target: DeployTarget;
  name: string;
  message: string;
  kubectlCommands: string[];
  completedAt: string;
}

export function buildDefaultWorkloadCreateConfig(kind: PolyComputeWorkloadKind = 'kubevirt-vm'): WorkloadCreateConfig {
  const defaults: Record<PolyComputeWorkloadKind, Partial<WorkloadCreateConfig>> = {
    'kubevirt-vm': { name: 'demo-vm', image: 'kubevirt/cirros-container-disk-demo:latest' },
    'incus-lxc': { name: 'demo-lxc', image: 'images:ubuntu/22.04' },
    'k8s-pod': { name: 'demo-pod', image: 'nginx:1.25-alpine' },
  };
  return {
    kind,
    name: defaults[kind].name ?? 'demo-workload',
    namespace: 'tenant-apps',
    cpuCores: 2,
    memoryGiB: 4,
    image: defaults[kind].image ?? 'nginx:1.25-alpine',
    enableHa: true,
    hostAffinity: 'any',
  };
}

export function getDeployPhases(target: DeployTarget, name: string): DeployPhase[] {
  switch (target) {
    case 'cluster':
      return [
        { label: 'Validate install plan', detail: 'Checking disks, VIP, and cluster token' },
        { label: 'Stage Harvester ISO', detail: 'Preparing platform/harvester boot artifacts' },
        { label: 'Apply node config', detail: `Writing config for ${name}` },
        { label: 'Bootstrap RKE2', detail: 'Starting control plane on first node' },
        { label: 'Register storage CSI', detail: 'Longhorn + NVMe-oF drivers online' },
        { label: 'Cluster ready', detail: `${name} is reachable on the management VIP` },
      ];
    case 'join-cluster':
      return [
        { label: 'Validate join token', detail: 'Checking server URL and cluster token' },
        { label: 'Apply node config', detail: `Joining ${name} to existing cluster` },
        { label: 'Sync etcd membership', detail: 'Adding node to control plane quorum' },
        { label: 'Node ready', detail: `${name} joined successfully` },
      ];
    case 'workload':
      return [
        { label: 'Dry-run validation', detail: 'Server-side apply preview against Kubernetes API' },
        { label: 'Create namespace', detail: 'Ensuring target namespace exists' },
        { label: 'Apply manifests', detail: `Deploying ${name}` },
        { label: 'Wait for rollout', detail: 'Pods / replicas becoming ready' },
        { label: 'Workload live', detail: `${name} is running in the cluster` },
      ];
    case 'vm':
      return [
        { label: 'Validate VirtualMachine spec', detail: 'KubeVirt API schema check' },
        { label: 'Provision PVC', detail: 'Attaching boot disk from storage class' },
        { label: 'Launch VM', detail: `Starting ${name} via virt-launcher` },
        { label: 'VM running', detail: `${name} console available on Machines dashboard` },
      ];
    case 'lxc':
      return [
        { label: 'Validate Incus profile', detail: 'Checking cgroup and network profile' },
        { label: 'Pull image', detail: 'Fetching container rootfs' },
        { label: 'Start container', detail: `Launching ${name} on host` },
        { label: 'Container live', detail: `${name} reachable via console chip` },
      ];
    case 'pod':
      return [
        { label: 'Validate Pod spec', detail: 'Security context and resource limits' },
        { label: 'Schedule pod', detail: `Assigning ${name} to node` },
        { label: 'Pull image', detail: 'Container image on node' },
        { label: 'Pod running', detail: `${name} ready in namespace` },
      ];
  }
}

export function buildClusterDeployCommands(config: HarvesterMachineConfig): string[] {
  const commands = [
    `kubectl apply -f harvester-config-${config.hostName}.yaml`,
    `harvester-install --mode ${config.installMode} --hostname ${config.hostName}`,
  ];
  if (config.installMode === 'create') {
    commands.push(`curl -k https://${config.virtualIp}/v1/harvester/cluster/status`);
  }
  if (config.installMode === 'join') {
    commands.push(`harvester-install --server ${config.serverUrl} --token ${config.clusterToken}`);
  }
  return commands;
}

export function buildWorkloadDeployCommands(config: ApplicationConfig): string[] {
  return [
    `kubectl create namespace ${config.namespace} --dry-run=client -o yaml | kubectl apply -f -`,
    `kubectl apply -f ${config.appName}-manifest.yaml -n ${config.namespace}`,
    `kubectl rollout status ${config.workloadType.toLowerCase()}/${config.appName} -n ${config.namespace}`,
  ];
}

export function buildPolyComputeDeployCommands(workload: WorkloadCreateConfig): string[] {
  switch (workload.kind) {
    case 'kubevirt-vm':
      return [
        `kubectl apply -f ${workload.name}-vm.yaml -n ${workload.namespace}`,
        `kubectl wait vm/${workload.name} --for condition=Ready -n ${workload.namespace} --timeout=120s`,
      ];
    case 'incus-lxc':
      return [
        `incus launch ${workload.image} ${workload.name} --target ${workload.hostAffinity}`,
        `incus config set ${workload.name} limits.cpu ${workload.cpuCores}`,
      ];
    case 'k8s-pod':
      return [
        `kubectl run ${workload.name} --image=${workload.image} -n ${workload.namespace}`,
        `kubectl wait pod/${workload.name} --for condition=Ready -n ${workload.namespace}`,
      ];
  }
}

export function buildWorkloadManifest(workload: WorkloadCreateConfig): string {
  if (workload.kind === 'kubevirt-vm') {
    return YAML.stringify({
      apiVersion: 'kubevirt.io/v1',
      kind: 'VirtualMachine',
      metadata: { name: workload.name, namespace: workload.namespace },
      spec: {
        running: true,
        template: {
          spec: {
            domain: {
              cpu: { cores: workload.cpuCores },
              resources: { requests: { memory: `${workload.memoryGiB}Gi` } },
              devices: {
                disks: [{ name: 'containerdisk', disk: { bus: 'virtio' } }],
              },
            },
            volumes: [{ name: 'containerdisk', containerDisk: { image: workload.image } }],
          },
        },
      },
    });
  }
  if (workload.kind === 'incus-lxc') {
    return YAML.stringify({
      apiVersion: 'incus.nexus/v1',
      kind: 'SystemContainer',
      metadata: { name: workload.name, namespace: workload.namespace },
      spec: {
        image: workload.image,
        resources: { cpu: workload.cpuCores, memoryGiB: workload.memoryGiB },
        hostAffinity: workload.hostAffinity,
        ha: workload.enableHa,
      },
    });
  }
  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: workload.name, namespace: workload.namespace },
    spec: {
      containers: [
        {
          name: workload.name,
          image: workload.image,
          resources: {
            requests: { cpu: `${workload.cpuCores}`, memory: `${workload.memoryGiB}Gi` },
            limits: { cpu: `${workload.cpuCores}`, memory: `${workload.memoryGiB}Gi` },
          },
        },
      ],
    },
  });
}

export function canDeployCluster(plan: HarvesterMachineInstallPlan): boolean {
  return plan.validationIssues.length === 0;
}

export function canDeployWorkload(validation: ValidationResult): boolean {
  return validation.valid;
}

export function clusterDeployTarget(config: HarvesterMachineConfig): DeployTarget {
  return config.installMode === 'join' ? 'join-cluster' : 'cluster';
}

export function clusterDeployLabel(config: HarvesterMachineConfig): string {
  switch (config.installMode) {
    case 'create':
      return 'Create cluster';
    case 'join':
      return 'Join cluster';
    case 'binaries':
      return 'Install platform';
  }
}

export function workloadKindLabel(kind: PolyComputeWorkloadKind): string {
  switch (kind) {
    case 'kubevirt-vm':
      return 'Virtual machine';
    case 'incus-lxc':
      return 'LXC container';
    case 'k8s-pod':
      return 'Kubernetes pod';
  }
}

export function workloadCreateLabel(kind: PolyComputeWorkloadKind): string {
  switch (kind) {
    case 'kubevirt-vm':
      return 'Create virtual machine';
    case 'incus-lxc':
      return 'Create LXC container';
    case 'k8s-pod':
      return 'Create pod';
  }
}

export async function simulateDeploy(
  phases: DeployPhase[],
  onPhase?: (index: number, phase: DeployPhase) => void,
  delayMs = 350,
): Promise<void> {
  for (let index = 0; index < phases.length; index++) {
    onPhase?.(index, phases[index]);
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
}

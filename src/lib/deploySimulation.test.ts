import { describe, expect, it } from 'vitest';
import {
  buildClusterDeployCommands,
  buildDefaultWorkloadCreateConfig,
  buildPolyComputeDeployCommands,
  buildWorkloadDeployCommands,
  buildWorkloadManifest,
  canDeployCluster,
  canDeployWorkload,
  clusterDeployLabel,
  getDeployPhases,
  workloadCreateLabel,
} from './deploySimulation';
import { buildDefaultMachineConfig, buildHarvesterMachineInstallPlan } from './harvesterMachineWizard';
import { defaultConfig } from '../types';
import { validateKubernetesManifest } from './clusterWorkflow';
import { generateManifest } from './manifestGenerator';

describe('deploySimulation', () => {
  it('returns cluster deploy phases for create mode', () => {
    const phases = getDeployPhases('cluster', 'nexus-node-01');
    expect(phases.length).toBeGreaterThan(3);
    expect(phases.at(-1)?.label).toBe('Cluster ready');
  });

  it('builds cluster kubectl commands from machine config', () => {
    const config = buildDefaultMachineConfig();
    const commands = buildClusterDeployCommands(config);
    expect(commands.some((cmd) => cmd.includes('harvester-install'))).toBe(true);
    expect(commands.some((cmd) => cmd.includes(config.hostName))).toBe(true);
  });

  it('validates cluster deploy readiness from install plan', () => {
    const plan = buildHarvesterMachineInstallPlan(buildDefaultMachineConfig());
    expect(canDeployCluster(plan)).toBe(true);
  });

  it('builds workload deploy commands from application config', () => {
    const commands = buildWorkloadDeployCommands(defaultConfig);
    expect(commands[1]).toContain(defaultConfig.appName);
    expect(commands[2]).toContain(defaultConfig.workloadType.toLowerCase());
  });

  it('allows workload deploy when manifest validates', () => {
    const manifest = generateManifest(defaultConfig);
    const validation = validateKubernetesManifest(manifest);
    expect(canDeployWorkload(validation)).toBe(true);
  });

  it('generates kubevirt VM manifest for workload create config', () => {
    const config = buildDefaultWorkloadCreateConfig('kubevirt-vm');
    const yaml = buildWorkloadManifest(config);
    expect(yaml).toContain('kind: VirtualMachine');
    expect(yaml).toContain(config.name);
  });

  it('generates pod manifest for k8s-pod kind', () => {
    const config = buildDefaultWorkloadCreateConfig('k8s-pod');
    const yaml = buildWorkloadManifest(config);
    expect(yaml).toContain('kind: Pod');
  });

  it('builds poly-compute deploy commands per kind', () => {
    const vm = buildDefaultWorkloadCreateConfig('kubevirt-vm');
    expect(buildPolyComputeDeployCommands(vm)[1]).toContain('vm/');
    const pod = buildDefaultWorkloadCreateConfig('k8s-pod');
    expect(buildPolyComputeDeployCommands(pod)[0]).toContain('kubectl run');
  });

  it('returns human labels for deploy actions', () => {
    expect(clusterDeployLabel(buildDefaultMachineConfig())).toBe('Create cluster');
    expect(workloadCreateLabel('incus-lxc')).toBe('Create LXC container');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildDefaultMachineConfig,
  buildHarvesterMachineInstallPlan,
  validateHarvesterMachineConfig,
} from './harvesterMachineWizard';

describe('harvester machine wizard', () => {
  it('builds a Nexus-branded Harvester install plan from required machine fields', () => {
    const config = buildDefaultMachineConfig();
    const plan = buildHarvesterMachineInstallPlan({
      ...config,
      hostName: 'nexus-node-01',
      installDisk: '/dev/sda',
      dataDisk: '/dev/nvme0n1',
      managementInterface: 'eno1',
      virtualIp: '10.10.40.20',
      clusterToken: 'nexus-token',
      dnsServers: ['1.1.1.1', '9.9.9.9'],
      ntpServers: ['0.suse.pool.ntp.org'],
    });

    expect(plan.productName).toBe('Nexus');
    expect(plan.sourceRoot).toBe('platform/harvester');
    expect(plan.validationIssues).toEqual([]);
    expect(plan.configYaml).toContain('hostname: nexus-node-01');
    expect(plan.configYaml).toContain('device: /dev/sda');
    expect(plan.configYaml).toContain('data_disk: /dev/nvme0n1');
    expect(plan.configYaml).toContain('vip: 10.10.40.20');
    expect(plan.configYaml).toContain('live_migration:');
    expect(plan.configYaml).toContain('process_model: vmotion-style');
    expect(plan.configYaml).toContain('nvme_over_rdma:');
    expect(plan.configYaml).toContain('memory_tiering:');
    expect(plan.bootParameters).toContain('harvester.install.automatic=true');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'mode',
      'hardware',
      'storage',
      'network',
      'cluster',
      'migration',
      'acceleration',
      'source',
      'review',
    ]);
  });

  it('requires the fields Harvester needs before rendering an automatic install config', () => {
    const issues = validateHarvesterMachineConfig({
      ...buildDefaultMachineConfig(),
      hostName: '',
      installDisk: '',
      managementInterface: '',
      virtualIp: '',
      clusterToken: '',
    });

    expect(issues).toEqual([
      'Host name is required for Harvester node identity.',
      'Install disk is required so the appliance knows where to write Nexus.',
      'Management interface is required for the Harvester management network.',
      'Virtual IP is required when VIP mode is static.',
      'Cluster token is required for create and join modes.',
    ]);
  });

  it('requires and emits the server URL for join-mode machine installs', () => {
    const missingServerUrlIssues = validateHarvesterMachineConfig({
      ...buildDefaultMachineConfig(),
      installMode: 'join',
      serverUrl: '',
    });

    expect(missingServerUrlIssues).toContain('Server URL is required when joining an existing Nexus cluster.');

    const plan = buildHarvesterMachineInstallPlan({
      ...buildDefaultMachineConfig(),
      installMode: 'join',
      serverUrl: 'https://10.10.40.20:443',
    });

    expect(plan.validationIssues).toEqual([]);
    expect(plan.configYaml).toContain('server_url: https://10.10.40.20:443');
  });

  it('emits install-time NVMe over RDMA and memory tiering features when enabled', () => {
    const plan = buildHarvesterMachineInstallPlan({
      ...buildDefaultMachineConfig(),
      nvmeOverRdma: {
        enabled: true,
        fabricInterface: 'mlx5_0',
        storageClass: 'nexus-rdma-nvme',
      },
      memoryTiering: {
        enabled: true,
        mode: 'nvme',
        device: '/dev/nvme1n1',
        ratio: 0.25,
      },
    });

    expect(plan.configYaml).toContain('fabric_interface: mlx5_0');
    expect(plan.configYaml).toContain('storage_class: nexus-rdma-nvme');
    expect(plan.configYaml).toContain('mode: nvme');
    expect(plan.configYaml).toContain('device: /dev/nvme1n1');
    expect(plan.bootParameters).toContain('nexus.features.nvme_over_rdma=true');
    expect(plan.bootParameters).toContain('nexus.features.memory_tiering=nvme');
  });
});

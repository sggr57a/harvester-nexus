import { beforeEach, describe, expect, it } from 'vitest';
import { buildDefaultMachineConfig } from './harvesterMachineWizard';
import {
  clearSimulationState,
  recordClusterDeploy,
  recordPolyComputeDeploy,
  simulationToFleet,
} from './simulationStore';

describe('simulationStore', () => {
  beforeEach(() => {
    clearSimulationState();
  });

  it('records cluster nodes after deploy', () => {
    const config = buildDefaultMachineConfig();
    config.hostName = 'harvester-01';
    config.installMode = 'create';
    recordClusterDeploy(config);
    const fleet = simulationToFleet();
    expect(fleet.some((row) => row.kind === 'node' && row.name === 'harvester-01')).toBe(true);
    expect(fleet.filter((row) => row.kind === 'node').length).toBeGreaterThanOrEqual(3);
  });

  it('records poly-compute workloads after deploy', () => {
    recordClusterDeploy({ ...buildDefaultMachineConfig(), hostName: 'node-a', installMode: 'create' });
    recordPolyComputeDeploy({
      kind: 'kubevirt-vm',
      name: 'web-vm',
      namespace: 'tenant-apps',
      cpuCores: 2,
      memoryGiB: 4,
      image: 'kubevirt/cirros-container-disk-demo:latest',
      enableHa: true,
      hostAffinity: 'any',
    });
    const fleet = simulationToFleet();
    expect(fleet.some((row) => row.kind === 'vm' && row.name === 'web-vm')).toBe(true);
  });
});

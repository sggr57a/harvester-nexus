import { describe, expect, it } from 'vitest';
import { buildResourceMonitoring } from './activeOperations';

describe('buildResourceMonitoring', () => {
  it('models important active resources for the Resource Monitoring page', () => {
    const operations = buildResourceMonitoring();

    expect(operations.pageTitle).toBe('Resource Monitoring');
    expect(operations.menuItems.map((item) => item.id)).toEqual(['workloads', 'kubernetes', 'storage', 'compute', 'security']);
    expect(operations.workItems.map((item) => item.kind)).toEqual([
      'pod-activity',
      'dynamic-scheduling',
      'migration',
      'docker-container',
      'persistent-volume',
      'remote-share',
    ]);
    expect(operations.workItems.every((item) => item.progress >= 0 && item.progress <= 100)).toBe(true);
    expect(operations.monitoredResourceClasses).toEqual([
      'pods',
      'dynamic-scheduler',
      'lxc',
      'docker-containers',
      'virtual-machines',
      'persistent-volumes',
      'ceph',
      'nfs',
      'smb',
      'longhorn',
      'cpu',
      'ram',
      'swap',
      'storage',
    ]);
    expect(operations.resourceGraphs.map((graph) => graph.label)).toEqual(['CPU', 'RAM', 'Swap', 'Storage', 'Ceph', 'Longhorn']);
    expect(operations.resourceGraphs.every((graph) => graph.samples.length >= 10)).toBe(true);
    expect(operations.memoryPressure).toEqual({ visible: true, severity: 'warning', node: 'edge-a', pressurePercent: 87 });
    expect(operations.securityAudits.some((audit) => audit.vulnerabilityType === 'PVE')).toBe(true);
    expect(operations.securityAudits[0].recommendedAction).toContain('isolate');
  });

  it('hides memory pressure when it is not an issue', () => {
    const operations = buildResourceMonitoring({ memoryPressurePercent: 52 });

    expect(operations.memoryPressure.visible).toBe(false);
  });

  it('plans vMotion-style live migrations without workload shutdown', () => {
    const operations = buildResourceMonitoring();

    expect(operations.migrationProcesses.map((migration) => migration.workloadType)).toEqual(['LXC', 'Docker', 'VirtualMachine']);
    expect(operations.migrationProcesses.every((migration) => migration.processModel === 'vMotion-style live migration')).toBe(true);
    expect(operations.migrationProcesses.every((migration) => migration.memoryStatePreserved && migration.requiresShutdown === false)).toBe(true);
  });

  it('surfaces a high-signal cockpit summary for active systems', () => {
    const operations = buildResourceMonitoring();

    expect(operations.summary.activeWorkCount).toBe(operations.workItems.length);
    expect(operations.summary.highestSecurityScore).toBeGreaterThan(80);
    expect(operations.summary.blackGlassPanels).toBe(true);
    expect(operations.summary.animationStyle).toBe('drawn-hud');
    expect(operations.summary.monitoredButHiddenCount).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { buildActiveOperations } from './activeOperations';

describe('buildActiveOperations', () => {
  it('models active workload operations and security audits for the HUD work page', () => {
    const operations = buildActiveOperations();

    expect(operations.menuItems.map((item) => item.id)).toEqual(['command', 'workloads', 'storage', 'resources', 'security']);
    expect(operations.workItems.map((item) => item.kind)).toEqual(['pod-drain', 'pod-create', 'storage-allocation', 'resource-pressure']);
    expect(operations.workItems.every((item) => item.progress >= 0 && item.progress <= 100)).toBe(true);
    expect(operations.resourceGraphs).toHaveLength(4);
    expect(operations.resourceGraphs.every((graph) => graph.samples.length >= 10)).toBe(true);
    expect(operations.securityAudits.some((audit) => audit.vulnerabilityType === 'PVE')).toBe(true);
    expect(operations.securityAudits[0].recommendedAction).toContain('isolate');
  });

  it('surfaces a high-signal cockpit summary for active systems', () => {
    const operations = buildActiveOperations();

    expect(operations.summary.activeWorkCount).toBe(operations.workItems.length);
    expect(operations.summary.highestSecurityScore).toBeGreaterThan(80);
    expect(operations.summary.blackGlassPanels).toBe(true);
    expect(operations.summary.animationStyle).toBe('drawn-hud');
  });
});

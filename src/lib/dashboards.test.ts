import { describe, expect, it } from 'vitest';
import {
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildOperationsDashboard,
  buildProcessorMemoryDashboard,
  buildStorageDashboard,
} from './dashboards';

describe('networking dashboard data', () => {
  it('describes a connected topology with at least one edge per node', () => {
    const dash = buildNetworkingDashboard();
    expect(dash.topology.nodes.length).toBeGreaterThanOrEqual(6);
    expect(dash.topology.edges.length).toBeGreaterThanOrEqual(dash.topology.nodes.length - 1);
    for (const edge of dash.topology.edges) {
      expect(dash.topology.nodes.some((node) => node.id === edge.from)).toBe(true);
      expect(dash.topology.nodes.some((node) => node.id === edge.to)).toBe(true);
    }
  });

  it('exposes ingress routes for every supported mesh provider', () => {
    const dash = buildNetworkingDashboard();
    const providers = new Set(dash.ingressRoutes.map((route) => route.meshProvider));
    expect(providers.has('istio')).toBe(true);
    expect(providers.has('linkerd')).toBe(true);
    expect(providers.has('cilium')).toBe(true);
  });

  it('reports every documented VLAN and at least one degraded NIC for animation purposes', () => {
    const dash = buildNetworkingDashboard();
    expect(dash.vlans.length).toBeGreaterThanOrEqual(4);
    expect(dash.nicBonds.some((bond) => bond.state === 'degraded')).toBe(true);
  });
});

describe('storage dashboard data', () => {
  it('covers every backend named in the README', () => {
    const ids = buildStorageDashboard().backends.map((backend) => backend.id);
    for (const required of ['ceph', 'longhorn', 'nvme-of', 'rdma', 'zfs', 'iscsi', 'nfs', 'smb', 'glusterfs', 'openebs', 'portworx', 'local']) {
      expect(ids).toContain(required);
    }
  });

  it('keeps usage and IOPS within sane ranges', () => {
    for (const backend of buildStorageDashboard().backends) {
      expect(backend.usagePercent).toBeGreaterThanOrEqual(0);
      expect(backend.usagePercent).toBeLessThanOrEqual(100);
      expect(backend.iops).toBeGreaterThan(0);
    }
  });
});

describe('machines dashboard data', () => {
  it('surfaces every workload kind on the fleet table', () => {
    const kinds = new Set(buildMachinesDashboard().fleet.map((row) => row.kind));
    expect(kinds.has('vm')).toBe(true);
    expect(kinds.has('lxc')).toBe(true);
    expect(kinds.has('docker')).toBe(true);
    expect(kinds.has('pod')).toBe(true);
  });

  it('tracks at least one migration that preserves memory and avoids shutdown', () => {
    const dash = buildMachinesDashboard();
    expect(dash.migrations.length).toBeGreaterThan(0);
    expect(dash.migrations.every((migration) => migration.preservesMemory)).toBe(true);
  });
});

describe('processor and memory dashboard data', () => {
  it('describes NUMA zones with cores within 0..100% utilization', () => {
    for (const zone of buildProcessorMemoryDashboard().numaZones) {
      expect(zone.cores.length).toBeGreaterThanOrEqual(16);
      for (const core of zone.cores) {
        expect(core.utilizationPercent).toBeGreaterThanOrEqual(0);
        expect(core.utilizationPercent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('lists DRAM, NVMe tier, phase-change, and swap memory tiers', () => {
    const ids = buildProcessorMemoryDashboard().memoryTiers.map((tier) => tier.id);
    expect(ids).toEqual(expect.arrayContaining(['dram', 'nvme', 'phase-change', 'swap']));
  });
});

describe('operations dashboard data', () => {
  it('produces cost and power tables, plus all four compliance frameworks', () => {
    const dash = buildOperationsDashboard();
    expect(dash.cost.length).toBeGreaterThan(0);
    expect(dash.power.length).toBeGreaterThan(0);
    const frameworks = dash.compliance.map((lane) => lane.framework);
    expect(frameworks).toEqual(
      expect.arrayContaining(['BSI Grundschutz', 'ISO 27001', 'NIS2', 'SOC 2']),
    );
  });

  it('represents argocd, flux, and jenkins-x gitops providers', () => {
    const providers = new Set(buildOperationsDashboard().gitops.map((target) => target.provider));
    expect(providers.has('argocd')).toBe(true);
    expect(providers.has('flux')).toBe(true);
    expect(providers.has('jenkins-x')).toBe(true);
  });

  it('contains at least one backup that breached its RPO so the SLA panel exercises the alert state', () => {
    const dash = buildOperationsDashboard();
    expect(dash.backupSla.some((row) => row.lastBackupMinutesAgo > row.rpoMinutes)).toBe(true);
  });
});

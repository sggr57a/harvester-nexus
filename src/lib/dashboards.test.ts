import { describe, expect, it } from 'vitest';
import {
  buildAccelerationDashboard,
  buildActivityDashboard,
  buildEnvironmentDashboard,
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildOperationsDashboard,
  buildPolyComputeDashboard,
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
  it('covers every backend named in the README plus the v2.0 Vitastor addition and ZFS AnyRAID', () => {
    const ids = buildStorageDashboard().backends.map((backend) => backend.id);
    for (const required of ['ceph', 'longhorn', 'nvme-of', 'rdma', 'zfs', 'zfs-anyraid', 'iscsi', 'nfs', 'smb', 'glusterfs', 'openebs', 'portworx', 'vitastor', 'local']) {
      expect(ids).toContain(required);
    }
  });

  it('tags the v2.0 hardware acceleration features onto the relevant backends', () => {
    const backends = buildStorageDashboard().backends;
    const byId = new Map(backends.map((backend) => [backend.id, backend]));
    expect(byId.get('ceph')?.features).toContain('spdk-userspace');
    expect(byId.get('nvme-of')?.features).toContain('spdk-userspace');
    expect(byId.get('rdma')?.features).toContain('spdk-userspace');
    expect(byId.get('vitastor')?.features).toContain('spdk-userspace');
    expect(byId.get('zfs')?.features).toContain('copy-on-write');
    expect(byId.get('zfs')?.features).toContain('arc-cache');
    expect(byId.get('iscsi')?.features).toContain('vfio-pci-multipath');
    expect(byId.get('nfs')?.features).toContain('subpath-driver');
    expect(byId.get('smb')?.features).toContain('subpath-driver');
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

describe('poly-compute dashboard data (v2.0)', () => {
  it('exposes all three runtimes named in UPDATED.md', () => {
    const ids = buildPolyComputeDashboard().runtimes.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['kubevirt', 'incus-lxc', 'k8s-pods']));
  });

  it('reports node density blends with at least one all-modes mixed node', () => {
    const blend = buildPolyComputeDashboard().nodeBlend;
    expect(blend.length).toBeGreaterThan(0);
    expect(blend.some((node) => node.vms > 0 && node.systemContainers > 0 && node.pods > 0)).toBe(true);
  });

  it('keeps topology-aware scheduling policies non-empty and majority enabled', () => {
    const policies = buildPolyComputeDashboard().topologyAwareScheduling;
    expect(policies.length).toBeGreaterThanOrEqual(4);
    const enabled = policies.filter((p) => p.enabled).length;
    expect(enabled / policies.length).toBeGreaterThanOrEqual(0.6);
  });
});

describe('acceleration dashboard data (v2.0)', () => {
  it('lists SPDK, DPDK, vhost-user, NUMA pinning, 1 GiB hugepages, and GPU pass-through', () => {
    const ids = buildAccelerationDashboard().features.map((f) => f.id);
    for (const expected of ['spdk', 'dpdk', 'vhost-user', 'numa', 'hugepage-1g', 'gpu-pt']) {
      expect(ids).toContain(expected);
    }
  });

  it('produces NUMA pinning entries with non-empty cores and PCI devices', () => {
    for (const entry of buildAccelerationDashboard().numaPinning) {
      expect(entry.cores.length).toBeGreaterThan(0);
      expect(entry.pciDevices.length).toBeGreaterThan(0);
    }
  });

  it('exposes at least one GPU pass-through device bound via vfio-pci or mdev', () => {
    const gpus = buildAccelerationDashboard().passThrough.filter((d) => d.kind === 'gpu');
    expect(gpus.length).toBeGreaterThan(0);
    expect(gpus.every((g) => g.driver === 'vfio-pci' || g.driver === 'mdev' || g.driver === 'sr-iov')).toBe(true);
  });

  it('lists nested virtualization clusters that cover training, inference, sandbox, and CI roles', () => {
    const roles = new Set(buildAccelerationDashboard().nestedClusters.map((c) => c.guestRole));
    expect(roles.has('training')).toBe(true);
    expect(roles.has('inference')).toBe(true);
    expect(roles.has('sandbox')).toBe(true);
    expect(roles.has('ci')).toBe(true);
  });
});

describe('environment dashboard data', () => {
  it('tracks facility zones with spatial coordinates and bounded climate values', () => {
    const dash = buildEnvironmentDashboard();

    expect(dash.zones.length).toBeGreaterThanOrEqual(5);
    expect(dash.totals.map((total) => total.label)).toContain('Thermal average');
    expect(dash.backdropVectors).toHaveLength(12);
    for (const zone of dash.zones) {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.x).toBeLessThanOrEqual(100);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeLessThanOrEqual(100);
      expect(zone.thermalC).toBeGreaterThan(0);
      expect(zone.humidityPercent).toBeGreaterThanOrEqual(0);
      expect(zone.humidityPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe('activity dashboard data', () => {
  it('exposes operator lanes with queue counts and burst samples', () => {
    const dash = buildActivityDashboard();

    expect(dash.signals.length).toBeGreaterThanOrEqual(4);
    expect(dash.lanes.some((lane) => lane.failed > 0)).toBe(true);
    expect(dash.bursts.every((burst) => burst.samples.length >= 12)).toBe(true);
    for (const lane of dash.lanes) {
      expect(lane.queued + lane.running + lane.completed + lane.failed).toBeGreaterThan(0);
      expect(lane.saturationPercent).toBeGreaterThanOrEqual(0);
      expect(lane.saturationPercent).toBeLessThanOrEqual(100);
    }
  });
});

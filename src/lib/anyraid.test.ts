import { describe, expect, it } from 'vitest';
import { describeAnyRaidPlan, planAnyRaidCapacity } from './anyraid';

describe('AnyRAID capacity planner', () => {
  it('plans a heterogeneous-capacity raidz1 pool', () => {
    const plan = planAnyRaidCapacity({
      disks: [
        { device: '/dev/sda', capacityGiB: 4000 },
        { device: '/dev/sdb', capacityGiB: 1000 },
        { device: '/dev/sdc', capacityGiB: 8000 },
      ],
      slabSizeMiB: 64,
      profile: 'raidz1',
      hotSpareSlabsPerDisk: 2,
    });

    expect(plan.dataDiskCount).toBe(3);
    expect(plan.minDisksRequired).toBe(3);
    expect(plan.rawDataGiB).toBe(13000);
    expect(plan.warnings).toEqual([]);
    // raidz1 over a 3-disk group is 1/3 parity, so ~67% efficiency.
    expect(plan.efficiency).toBeGreaterThan(0.6);
    expect(plan.efficiency).toBeLessThan(0.7);
    expect(plan.usableGiB).toBeGreaterThan(8500);
    expect(plan.usableGiB).toBeLessThan(8700);
    expect(plan.hotSpareSlabs).toBeGreaterThan(0);
  });

  it('warns when too few drives are supplied for the chosen profile', () => {
    const plan = planAnyRaidCapacity({
      disks: [{ device: '/dev/sda', capacityGiB: 1000 }],
      profile: 'raidz2',
    });
    expect(plan.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('at least 4 data disks')]),
    );
  });

  it('excludes cache/log drives from the data redundancy domain', () => {
    const plan = planAnyRaidCapacity({
      disks: [
        { device: '/dev/sda', capacityGiB: 2000 },
        { device: '/dev/sdb', capacityGiB: 2000 },
        { device: '/dev/sdc', capacityGiB: 2000 },
        { device: '/dev/nvme0n1', capacityGiB: 500, role: 'cache' },
        { device: '/dev/nvme1n1', capacityGiB: 200, role: 'log' },
      ],
      profile: 'raidz1',
    });
    expect(plan.dataDiskCount).toBe(3);
    expect(plan.rawDataGiB).toBe(6000);
  });

  it('computes mirror efficiency near 50%', () => {
    const plan = planAnyRaidCapacity({
      disks: [
        { device: '/dev/sda', capacityGiB: 2000 },
        { device: '/dev/sdb', capacityGiB: 2000 },
      ],
      profile: 'mirror',
    });
    expect(plan.efficiency).toBeCloseTo(0.5, 1);
  });

  it('describeAnyRaidPlan emits a compact summary string', () => {
    const plan = planAnyRaidCapacity({
      disks: [
        { device: '/dev/sda', capacityGiB: 4000 },
        { device: '/dev/sdb', capacityGiB: 4000 },
        { device: '/dev/sdc', capacityGiB: 4000 },
      ],
      profile: 'raidz1',
    });
    const desc = describeAnyRaidPlan(plan);
    expect(desc).toContain('disks=3');
    expect(desc).toContain('raw=12000GiB');
    expect(desc).toContain('efficiency=');
  });
});

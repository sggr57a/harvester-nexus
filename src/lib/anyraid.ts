/**
 * ZFS AnyRAID capacity calculator.
 *
 * AnyRAID is a slab-based ZFS layout that accepts a heterogeneous set of
 * physical drives — different vendors, different capacities — and carves
 * each disk into uniformly-sized "slabs". The redundancy profile is then
 * enforced at the slab layer rather than at the whole-disk layer, so a
 * 4 TB drive can contribute eight 512 GiB slabs and a 1 TB drive can
 * contribute two, and the pool stays balanced as long as each redundancy
 * group has at least the required number of slabs from distinct disks.
 *
 * This module computes the effective usable capacity of an AnyRAID pool
 * given:
 *   - the per-disk inventory (device, capacity, optional role)
 *   - the slab size
 *   - the redundancy profile
 *   - the hot-spare slabs reserved per disk
 *
 * The result is intended to drive UI previews and YAML manifest hints.
 */

export type AnyRaidProfile = 'mirror' | 'striped-mirror' | 'raidz1' | 'raidz2' | 'raidz3';

export interface AnyRaidDisk {
  device: string;
  capacityGiB: number;
  role?: 'data' | 'cache' | 'log';
}

export interface AnyRaidPlanInput {
  disks: AnyRaidDisk[];
  slabSizeMiB?: number;
  profile?: AnyRaidProfile;
  hotSpareSlabsPerDisk?: number;
}

export interface AnyRaidPlan {
  /** Total raw capacity across data disks (cache/log are excluded), in GiB. */
  rawDataGiB: number;
  /** Total slab count across data disks (post hot-spare reservation). */
  totalDataSlabs: number;
  /** Slabs reserved for hot-spare across all data disks. */
  hotSpareSlabs: number;
  /** Number of disks contributing to the data pool. */
  dataDiskCount: number;
  /** Slabs that hold parity (or the mirror's redundant copies) — unusable. */
  paritySlabs: number;
  /** Effective usable capacity, in GiB. */
  usableGiB: number;
  /** Storage efficiency: usable / raw, expressed as a decimal 0..1. */
  efficiency: number;
  /** Minimum disks the chosen profile would normally require. */
  minDisksRequired: number;
  /** Validation messages — empty array means "ok". */
  warnings: string[];
}

const PROFILE_PARITY_PER_GROUP: Record<AnyRaidProfile, number> = {
  mirror: 1,
  'striped-mirror': 1,
  raidz1: 1,
  raidz2: 2,
  raidz3: 3,
};

const PROFILE_GROUP_SIZE: Record<AnyRaidProfile, number> = {
  mirror: 2,
  'striped-mirror': 2,
  raidz1: 3,
  raidz2: 4,
  raidz3: 5,
};

const PROFILE_MIN_DISKS: Record<AnyRaidProfile, number> = {
  mirror: 2,
  'striped-mirror': 4,
  raidz1: 3,
  raidz2: 4,
  raidz3: 5,
};

/** Compute the effective AnyRAID pool capacity. */
export function planAnyRaidCapacity(input: AnyRaidPlanInput): AnyRaidPlan {
  const slabMiB = input.slabSizeMiB && input.slabSizeMiB > 0 ? input.slabSizeMiB : 64;
  const profile: AnyRaidProfile = input.profile ?? 'raidz1';
  const hotSparePerDisk = Math.max(0, input.hotSpareSlabsPerDisk ?? 0);

  // Only `data` (or unspecified) disks contribute to redundancy/usable capacity.
  // Cache (L2ARC) and log (SLOG) drives are tracked separately; AnyRAID treats
  // them as auxiliary devices outside the main redundancy domain.
  const dataDisks = input.disks.filter((d) => !d.role || d.role === 'data');
  const dataDiskCount = dataDisks.length;
  const minDisks = PROFILE_MIN_DISKS[profile];

  const warnings: string[] = [];
  if (dataDiskCount < minDisks) {
    warnings.push(`Profile ${profile} requires at least ${minDisks} data disks; pool has ${dataDiskCount}.`);
  }
  for (const disk of input.disks) {
    if (disk.capacityGiB <= 0) {
      warnings.push(`Disk ${disk.device} has invalid capacity ${disk.capacityGiB} GiB.`);
    }
    if (!disk.device) {
      warnings.push('Disk entry is missing a device path.');
    }
  }

  // Compute slabs per data disk: each disk contributes floor(cap / slabSize).
  // Each disk reserves `hotSparePerDisk` slabs for global hot-spare pool.
  const slabsPerDisk = dataDisks.map((d) => {
    const totalSlabs = Math.floor((d.capacityGiB * 1024) / slabMiB);
    const usable = Math.max(0, totalSlabs - hotSparePerDisk);
    return { device: d.device, totalSlabs, usable };
  });

  const totalDataSlabs = slabsPerDisk.reduce((s, x) => s + x.usable, 0);
  const hotSpareSlabs = slabsPerDisk.reduce((s, x) => s + Math.min(hotSparePerDisk, x.totalSlabs), 0);

  // The redundancy ratio is parity / group_size: e.g. raidz1 over a typical
  // 3-disk group = 1/3 parity. For AnyRAID we approximate this at the slab
  // layer because each slab-group inherits the same overhead ratio.
  const groupSize = PROFILE_GROUP_SIZE[profile];
  const parityPerGroup = PROFILE_PARITY_PER_GROUP[profile];
  const overhead = parityPerGroup / groupSize;

  const paritySlabs = Math.round(totalDataSlabs * overhead);
  const usableSlabs = Math.max(0, totalDataSlabs - paritySlabs);

  const slabsPerGiB = 1024 / slabMiB;
  const usableGiB = usableSlabs / slabsPerGiB;
  const rawDataGiB = dataDisks.reduce((s, d) => s + d.capacityGiB, 0);
  const efficiency = rawDataGiB > 0 ? usableGiB / rawDataGiB : 0;

  return {
    rawDataGiB,
    totalDataSlabs,
    hotSpareSlabs,
    dataDiskCount,
    paritySlabs,
    usableGiB,
    efficiency,
    minDisksRequired: minDisks,
    warnings,
  };
}

/** Format a `AnyRaidPlan` for human consumption (used in YAML / UI hints). */
export function describeAnyRaidPlan(plan: AnyRaidPlan): string {
  const eff = (plan.efficiency * 100).toFixed(0);
  return [
    `disks=${plan.dataDiskCount}`,
    `raw=${plan.rawDataGiB.toFixed(0)}GiB`,
    `usable=${plan.usableGiB.toFixed(0)}GiB`,
    `efficiency=${eff}%`,
    `parity=${plan.paritySlabs}slabs`,
    `hotSpare=${plan.hotSpareSlabs}slabs`,
  ].join(' · ');
}

/**
 * Contract tests for installer/overlay/usr/lib/nexus/anyraid_provisioner.py.
 *
 * AnyRAID is implemented over LVM: a volume group pools physical volumes of
 * differing sizes and allocates in fixed-size extents (the "slabs"), with
 * redundancy from dm-raid. These tests cover the planning and validation logic,
 * which is pure and needs no root. Pool creation itself drives lvcreate and is
 * exercised on a node with a device-mapper capable kernel.
 *
 * Capacity planning is verified against sparse loop-backed files so the sizes
 * are real rather than mocked.
 */

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/anyraid_provisioner.py');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-anyraid-'));

/** Sparse files standing in for block devices, so sizes are genuinely read. */
const DEVICES = {
  small1: join(workdir, 'small1.img'),
  small2: join(workdir, 'small2.img'),
  small3: join(workdir, 'small3.img'),
  small4: join(workdir, 'small4.img'),
  small5: join(workdir, 'small5.img'),
  medium: join(workdir, 'medium.img'),
  large: join(workdir, 'large.img'),
};

const MIB = 1024 * 1024;

beforeAll(() => {
  const sizes: Array<[string, number]> = [
    [DEVICES.small1, 640 * MIB],
    [DEVICES.small2, 640 * MIB],
    [DEVICES.small3, 640 * MIB],
    [DEVICES.small4, 640 * MIB],
    [DEVICES.small5, 640 * MIB],
    [DEVICES.medium, 1280 * MIB],
    [DEVICES.large, 2048 * MIB],
  ];
  for (const [path, size] of sizes) {
    writeFileSync(path, '');
    truncateSync(path, size);
    closeSync(openSync(path, 'r'));
  }
});

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

interface PlanResult {
  ok: boolean;
  error?: string;
  plan?: {
    profile: string;
    lvmType: string;
    dataDrives: number;
    redundantLegs: number;
    usableBytes: number;
    rawBytes: number;
    strandedBytes: number;
    heterogeneous: boolean;
    toleratedDriveFailures: number;
    extentsPerDrive: number;
  };
}

/**
 * Plan a pool. Device paths are passed through a patched validator because the
 * production regex correctly insists on /dev/... paths, which a unit test
 * cannot create.
 */
function plan(devices: string[], profile: string, extentMiB = 64): PlanResult {
  const script = [
    'import importlib.util, json',
    `spec = importlib.util.spec_from_file_location("ar", ${JSON.stringify(MODULE)})`,
    'ar = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(ar)',
    'ar._validate_device = lambda d: d',  // allow tmpdir paths
    'try:',
    `    p = ar.plan_pool(${JSON.stringify(devices)}, ${JSON.stringify(profile)}, ${extentMiB})`,
    '    print(json.dumps({"ok": True, "plan": p}))',
    'except ar.AnyRaidError as e:',
    '    print(json.dumps({"ok": False, "error": str(e)}))',
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8' })) as PlanResult;
}

describe('profile to dm-raid mapping', () => {
  it.each([
    ['mirror', 'raid1', 1],
    ['striped-mirror', 'raid10', 1],
    ['raidz1', 'raid5', 1],
    ['raidz2', 'raid6', 2],
  ])('maps %s onto %s', (profile, lvmType, legs) => {
    const all = [DEVICES.small1, DEVICES.small2, DEVICES.medium, DEVICES.large];
    const result = plan(all, profile);
    expect(result.ok).toBe(true);
    expect(result.plan!.lvmType).toBe(lvmType);
    expect(result.plan!.redundantLegs).toBe(legs);
  });

  it('refuses raidz3 rather than silently downgrading to raid6', () => {
    const all = [DEVICES.small1, DEVICES.small2, DEVICES.medium, DEVICES.large];
    const result = plan(all, 'raidz3');
    expect(result.ok).toBe(false);
    // Delivering 2-drive tolerance for a 3-parity request would misrepresent
    // the redundancy the operator selected.
    expect(result.error).toMatch(/no triple-parity/i);
  });

  it('rejects an unknown profile', () => {
    const result = plan([DEVICES.small1, DEVICES.small2, DEVICES.medium], 'raidz9');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown profile/i);
  });
});

describe('heterogeneous capacity accounting', () => {
  it('bounds usable capacity by the smallest member, not the raw sum', () => {
    const all = [DEVICES.small1, DEVICES.small2, DEVICES.medium, DEVICES.large];
    const { plan: p } = plan(all, 'raidz1');

    expect(p!.heterogeneous).toBe(true);
    // raidz1 over 4 drives => 3 data drives, each limited to the 640 MiB member.
    expect(p!.dataDrives).toBe(3);
    expect(p!.usableBytes).toBe(p!.extentsPerDrive * 64 * MIB * 3);
    // Raw total is ~4.5 GiB; usable must be well below it.
    expect(p!.usableBytes).toBeLessThan(p!.rawBytes);
    expect(p!.strandedBytes).toBeGreaterThan(0);
  });

  it('reports no stranded capacity when all drives match', () => {
    const { plan: p } = plan([DEVICES.small1, DEVICES.small2, DEVICES.small3], 'mirror');
    expect(p!.heterogeneous).toBe(false);
    expect(p!.strandedBytes).toBe(0);
  });

  it('states tolerated drive failures per profile', () => {
    const four = [DEVICES.small1, DEVICES.small2, DEVICES.medium, DEVICES.large];
    expect(plan(four, 'raidz1').plan!.toleratedDriveFailures).toBe(1);
    expect(plan(four, 'raidz2').plan!.toleratedDriveFailures).toBe(2);
    // An N-way mirror survives every drive but one.
    expect(plan(four, 'mirror').plan!.toleratedDriveFailures).toBe(3);
  });

  it('honours a larger extent size', () => {
    const all = [DEVICES.small1, DEVICES.small2, DEVICES.medium];
    const small = plan(all, 'raidz1', 64).plan!;
    const large = plan(all, 'raidz1', 256).plan!;
    expect(small.extentsPerDrive).toBeGreaterThan(large.extentsPerDrive);
  });
});

describe('input validation', () => {
  it('enforces the minimum drive count per profile', () => {
    expect(plan([DEVICES.small1], 'mirror').error).toMatch(/at least 2/);
    expect(plan([DEVICES.small1, DEVICES.small2], 'raidz1').error).toMatch(/at least 3/);
    expect(plan([DEVICES.small1, DEVICES.small2, DEVICES.medium], 'raidz2').error).toMatch(/at least 4/);
  });

  it('requires an even drive count for raid10', () => {
    // Five drives clears the 4-drive minimum, so the parity check is what fails.
    const five = [
      DEVICES.small1,
      DEVICES.small2,
      DEVICES.small3,
      DEVICES.small4,
      DEVICES.small5,
    ];
    const result = plan(five, 'striped-mirror');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/even number/i);
  });

  it('rejects duplicate devices', () => {
    const dupes = [DEVICES.small1, DEVICES.small1, DEVICES.medium];
    expect(plan(dupes, 'raidz1').error).toMatch(/duplicate/i);
  });

  it('rejects device paths outside /dev, including injection attempts', () => {
    // Uses the real validator, so no monkeypatch here.
    const script = [
      'import importlib.util, json',
      `spec = importlib.util.spec_from_file_location("ar", ${JSON.stringify(MODULE)})`,
      'ar = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(ar)',
      'bad = ["/dev/sda; rm -rf /", "--force", "/etc/passwd", "/dev/../etc/shadow", "", "sda"]',
      'out = []',
      'for d in bad:',
      '    try:',
      '        ar._validate_device(d)',
      '        out.append({"device": d, "rejected": False})',
      '    except ar.AnyRaidError:',
      '        out.append({"device": d, "rejected": True})',
      'print(json.dumps(out))',
    ].join('\n');
    const results = JSON.parse(
      execFileSync('python3', ['-c', script], { encoding: 'utf-8' }),
    ) as Array<{ device: string; rejected: boolean }>;
    expect(results.every((r) => r.rejected)).toBe(true);
  });

  it('accepts well-formed device paths', () => {
    const script = [
      'import importlib.util, json',
      `spec = importlib.util.spec_from_file_location("ar", ${JSON.stringify(MODULE)})`,
      'ar = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(ar)',
      'good = ["/dev/sda", "/dev/nvme0n1", "/dev/disk/by-id/scsi-abc_123"]',
      'print(json.dumps([ar._validate_device(d) for d in good]))',
    ].join('\n');
    const out = JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8' }));
    expect(out).toEqual(['/dev/sda', '/dev/nvme0n1', '/dev/disk/by-id/scsi-abc_123']);
  });
});

describe('manifest hygiene', () => {
  it('no longer references the non-existent AnyRAID CSI image', () => {
    const manifest = resolve(__dirname, '../manifests/30-anyraid-csi.yaml');
    const text = readFileSync(manifest, 'utf-8');
    // Ignore comments: the file explains why the phantom driver was removed,
    // so it mentions the old names in prose. Only live YAML matters here.
    const active = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    // This image was never built: no source or Dockerfile for it exists in the
    // repo, so the DaemonSet was a guaranteed ImagePullBackOff.
    expect(active).not.toContain('nexus-anyraid-csi');
    expect(active).not.toContain('anyraid.csi.nexus.io');
    // The replacement must still provide the StorageClass the wizard expects.
    expect(active).toContain('anyraid-default');
  });
});

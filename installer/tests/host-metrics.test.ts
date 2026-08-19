/**
 * Contract tests for installer/overlay/usr/lib/nexus/host_metrics.py disk IOPS.
 *
 * Fake /proc/diskstats + a writable sample file. No real storage hardware.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/host_metrics.py');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-host-metrics-'));

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

function py<T>(snippet: string, env: Record<string, string> = {}): T {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location("hm", ${JSON.stringify(MODULE)})`,
    'hm = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(hm)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', script], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(out) as T;
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function diskstatsLine(
  name: string,
  reads: number,
  writes: number,
  sectorsRead: number,
  sectorsWrite: number,
): string {
  return ` 8 0 ${name} ${reads} 0 ${sectorsRead} 0 ${writes} 0 ${sectorsWrite} 0 0 0 0 0\n`;
}

describe('host_metrics · disk IOPS', () => {
  it('returns null IOPS on the first sample and does not invent a rate', () => {
    const root = join(workdir, 'first');
    const proc = join(root, 'proc');
    const sample = join(root, 'host-sample.json');
    write(join(proc, 'diskstats'), diskstatsLine('sda', 100, 40, 800, 320));
    write(join(proc, 'net/dev'), 'Inter-|   Receive\nface |bytes\neth0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n');

    const metrics = py<{ totalIops: number | null; disks: unknown[]; sources: Record<string, string> }>(
      [
        `print(json.dumps(hm.collect_host_metrics(proc_root=${JSON.stringify(proc)}, sample_file=${JSON.stringify(sample)})))`,
      ].join('\n'),
    );
    expect(metrics.totalIops).toBeNull();
    expect(metrics.sources.totalIops).toMatch(/two samples|unavailable/);
  });

  it('differences two samples into read/write IOPS and MiB/s per real disk', () => {
    const root = join(workdir, 'rate');
    const proc = join(root, 'proc');
    const sample = join(root, 'host-sample.json');
    write(
      join(proc, 'diskstats'),
      diskstatsLine('sda', 100, 50, 800, 400) + diskstatsLine('sda1', 100, 50, 800, 400),
    );
    write(join(proc, 'net/dev'), 'Inter-|   Receive\nface |bytes\neth0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n');

    py(`print(json.dumps(hm.collect_host_metrics(proc_root=${JSON.stringify(proc)}, sample_file=${JSON.stringify(sample)})))`);

    write(
      join(proc, 'diskstats'),
      diskstatsLine('sda', 300, 150, 2400, 1200) + diskstatsLine('sda1', 300, 150, 2400, 1200),
    );

    const metrics = py<{
      totalIops: number | null;
      readIops: number | null;
      writeIops: number | null;
      readMiBs: number | null;
      writeMiBs: number | null;
      disks: Array<{ device: string; iops: number; readIops: number; writeIops: number }>;
    }>(
      [
        'import time',
        `sample = ${JSON.stringify(sample)}`,
        'with open(sample, encoding="utf-8") as handle:',
        '    prev = json.load(handle)',
        'prev["timestamp"] = time.time() - 2.0',
        'prev["disks"] = {"sda": [100, 50, 800, 400]}',
        'with open(sample, "w", encoding="utf-8") as handle:',
        '    json.dump(prev, handle)',
        `print(json.dumps(hm.collect_host_metrics(proc_root=${JSON.stringify(proc)}, sample_file=sample)))`,
      ].join('\n'),
    );

    expect(metrics.totalIops).toBeGreaterThan(0);
    expect(metrics.readIops).toBeGreaterThan(0);
    expect(metrics.writeIops).toBeGreaterThan(0);
    expect(metrics.disks.map((d) => d.device)).toEqual(['sda']);
    expect(metrics.disks[0].iops).toBe(metrics.totalIops);
    // 200 reads + 100 writes over 2s = 150 IOPS
    expect(metrics.totalIops).toBeCloseTo(150, 0);
  });

  it('does not count NVMe partitions or loop devices', () => {
    const root = join(workdir, 'filter');
    const proc = join(root, 'proc');
    const sample = join(root, 'host-sample.json');
    write(
      join(proc, 'diskstats'),
      diskstatsLine('nvme0n1', 10, 10, 80, 80)
        + diskstatsLine('nvme0n1p1', 10, 10, 80, 80)
        + diskstatsLine('loop0', 99, 99, 800, 800),
    );
    write(join(proc, 'net/dev'), 'Inter-|   Receive\nface |bytes\neth0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n');
    py(`print(json.dumps(hm.collect_host_metrics(proc_root=${JSON.stringify(proc)}, sample_file=${JSON.stringify(sample)})))`);
    write(
      sample,
      JSON.stringify({
        timestamp: Date.now() / 1000 - 1,
        disks: { nvme0n1: [10, 10, 80, 80] },
      }),
    );
    write(
      join(proc, 'diskstats'),
      diskstatsLine('nvme0n1', 20, 20, 160, 160)
        + diskstatsLine('nvme0n1p1', 20, 20, 160, 160)
        + diskstatsLine('loop0', 199, 199, 1600, 1600),
    );

    const metrics = py<{ disks: Array<{ device: string }>; totalIops: number | null }>(
      `print(json.dumps(hm.collect_host_metrics(proc_root=${JSON.stringify(proc)}, sample_file=${JSON.stringify(sample)})))`,
    );
    expect(metrics.disks.map((d) => d.device)).toEqual(['nvme0n1']);
  });

  it('measures this host after two samples and never invents a CSI backend rate', () => {
    const sample = join(workdir, 'live-host-sample.json');
    const first = py<{ totalIops: number | null; disks: unknown[] }>(
      `print(json.dumps(hm.collect_host_metrics(sample_file=${JSON.stringify(sample)})))`,
    );
    expect(first.totalIops).toBeNull();

    execFileSync('python3', ['-c', 'import time; time.sleep(1.05)']);

    const second = py<{
      totalIops: number | null;
      disks: Array<{ device: string }>;
      sources: Record<string, string>;
    }>(`print(json.dumps(hm.collect_host_metrics(sample_file=${JSON.stringify(sample)})))`);

    if (second.disks.length > 0) {
      expect(typeof second.totalIops).toBe('number');
      expect(second.sources.totalIops).toMatch(/diskstats/);
    } else {
      expect(second.totalIops).toBeNull();
    }
  }, 15000);
});

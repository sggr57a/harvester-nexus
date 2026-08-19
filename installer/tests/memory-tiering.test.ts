/**
 * Contract tests for installer/overlay/usr/lib/nexus/memory_tiering.py.
 *
 * Discovery, planning, and metrics all take injectable /proc and /sys roots
 * so the suite never needs CXL DIMMs, Optane, or a spare NVMe. Apply is
 * exercised against those same trees (writes stay inside the temp dir).
 */

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/memory_tiering.py');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-memtier-'));

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

function py<T>(snippet: string, env: Record<string, string> = {}): T {
  const script = [
    'import importlib.util, json, os, sys',
    `spec = importlib.util.spec_from_file_location("mt", ${JSON.stringify(MODULE)})`,
    'mt = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(mt)',
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

function buildTree(name: string): { sys: string; proc: string; run: string; varlib: string } {
  const root = join(workdir, name);
  const sys = join(root, 'sys');
  const proc = join(root, 'proc');
  const run = join(root, 'run');
  const varlib = join(root, 'var', 'lib', 'nexus');
  mkdirSync(sys, { recursive: true });
  mkdirSync(proc, { recursive: true });
  mkdirSync(run, { recursive: true });
  mkdirSync(varlib, { recursive: true });
  return { sys, proc, run, varlib };
}

/** Two-socket DRAM + CXL memory-only nodes + Optane DAX + spare NVMe. */
function populatedHardware() {
  const t = buildTree('full');

  write(join(t.proc, 'cmdline'), 'BOOT_IMAGE=/vmlinuz root=LABEL=COS_STATE nexus.features.memory_tiering=auto\n');
  write(
    join(t.proc, 'meminfo'),
    [
      'MemTotal:       67108864 kB',
      'MemAvailable:   33554432 kB',
      'SwapTotal:            0 kB',
      'SwapFree:             0 kB',
      'AnonPages:      10485760 kB',
      'Committed_AS:   20971520 kB',
      'VmallocUsed:       1024 kB',
      'HugePages_Total:      0',
      'HugePages_Free:       0',
      'Hugepagesize:      2048 kB',
      'Shmem:              512 kB',
      'Active(anon):   8388608 kB',
      'Inactive(anon): 2097152 kB',
      'Active(file):   4194304 kB',
      'Inactive(file): 1048576 kB',
      '',
    ].join('\n'),
  );
  write(
    join(t.proc, 'vmstat'),
    [
      'nr_free_pages 1000',
      'pgdemote_kswapd 12',
      'pgdemote_direct 3',
      'pgpromote_success 4',
      'pgpromote_candidate 9',
      'pswpin 0',
      'pswpout 0',
      'zswpin 0',
      'zswpout 0',
      'pgfault 100',
      'pgmajfault 2',
      'numa_hit 800',
      'numa_miss 40',
      'numa_foreign 5',
      'pgmigrate_success 7',
      '',
    ].join('\n'),
  );
  write(join(t.proc, 'swaps'), 'Filename\tType\tSize\tUsed\tPriority\n');
  write(join(t.proc, 'pressure', 'memory'), 'some avg10=1.00 avg60=2.00 avg300=3.00 total=100\nfull avg10=0.10 avg60=0.20 avg300=0.30 total=10\n');
  write(join(t.proc, 'pressure', 'cpu'), 'some avg10=4.00 avg60=5.00 avg300=6.00 total=200\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n');
  write(join(t.proc, 'pressure', 'io'), 'some avg10=7.00 avg60=8.00 avg300=9.00 total=300\nfull avg10=1.00 avg60=1.00 avg300=1.00 total=20\n');
  write(join(t.proc, 'stat'), 'cpu  100 0 50 850 0 0 0 0 0 0\ncpu0 40 0 20 340 0 0 0 0 0 0\ncpu1 60 0 30 510 0 0 0 0 0 0\n');

  write(join(t.sys, 'devices/system/node/node0/cpulist'), '0-1\n');
  write(join(t.sys, 'devices/system/node/node0/distance'), '10 21 40 41\n');
  write(join(t.sys, 'devices/system/node/node0/meminfo'), 'Node 0 MemTotal: 33554432 kB\nNode 0 MemUsed: 16777216 kB\n');
  write(join(t.sys, 'devices/system/node/node1/cpulist'), '2-3\n');
  write(join(t.sys, 'devices/system/node/node1/distance'), '21 10 41 40\n');
  write(join(t.sys, 'devices/system/node/node1/meminfo'), 'Node 1 MemTotal: 33554432 kB\nNode 1 MemUsed: 8388608 kB\n');
  write(join(t.sys, 'devices/system/node/node2/cpulist'), '\n');
  write(join(t.sys, 'devices/system/node/node2/distance'), '40 41 10 21\n');
  write(join(t.sys, 'devices/system/node/node2/meminfo'), 'Node 2 MemTotal: 67108864 kB\nNode 2 MemUsed: 1048576 kB\n');
  write(join(t.sys, 'devices/system/node/node3/cpulist'), '\n');
  write(join(t.sys, 'devices/system/node/node3/distance'), '41 40 21 10\n');
  write(join(t.sys, 'devices/system/node/node3/meminfo'), 'Node 3 MemTotal: 67108864 kB\nNode 3 MemUsed: 2097152 kB\n');

  write(join(t.sys, 'devices/virtual/memory_tiering/memory_tier4/nodelist'), '0-1\n');
  write(join(t.sys, 'devices/virtual/memory_tiering/memory_tier8/nodelist'), '2-3\n');

  write(join(t.sys, 'bus/cxl/devices/mem0/serial'), 'cxl-mem-0\n');
  write(join(t.sys, 'bus/cxl/devices/decoder0.0/size'), '0x1000000000\n');
  mkdirSync(join(t.sys, 'bus/cxl/devices/port1'), { recursive: true });
  mkdirSync(join(t.sys, 'bus/cxl/devices/switch0'), { recursive: true });
  mkdirSync(join(t.sys, 'bus/cxl/drivers/cxl_mem'), { recursive: true });

  write(join(t.sys, 'bus/dax/devices/dax0.0/size'), `${128 * 1024 * 1024 * 1024}\n`);
  write(join(t.sys, 'bus/dax/devices/dax0.0/target_node'), '4\n');
  write(join(t.sys, 'bus/dax/devices/dax0.0/align'), '2097152\n');
  mkdirSync(join(t.sys, 'bus/dax/drivers/device_dax'), { recursive: true });
  mkdirSync(join(t.sys, 'bus/dax/drivers/kmem'), { recursive: true });
  write(join(t.sys, 'bus/dax/drivers/kmem/new_id'), '');
  write(join(t.sys, 'bus/dax/drivers/kmem/bind'), '');
  chmodSync(join(t.sys, 'bus/dax/drivers/kmem/bind'), 0o644);

  write(join(t.sys, 'class/block/pmem0/size'), `${256 * 1024 * 1024 * 2}\n`); // 512-byte sectors → 256 GiB
  write(join(t.sys, 'class/block/nvme0n1/size'), `${100 * 1024 * 1024 * 2}\n`);
  write(join(t.sys, 'class/block/nvme1n1/size'), `${400 * 1024 * 1024 * 2}\n`);
  mkdirSync(join(t.sys, 'class/block/nvme0n1/holders'), { recursive: true });
  mkdirSync(join(t.sys, 'class/block/nvme1n1/holders'), { recursive: true });
  write(join(t.sys, 'block/nvme0n1/dev'), '259:0\n');
  write(join(t.sys, 'block/nvme1n1/dev'), '259:1\n');
  write(join(t.proc, 'mounts'), '/dev/nvme0n1p2 / ext4 rw 0 0\n');

  write(join(t.sys, 'module/zswap/parameters/enabled'), 'N\n');
  write(join(t.sys, 'module/zswap/parameters/compressor'), 'lzo\n');
  write(join(t.sys, 'module/zswap/parameters/max_pool_percent'), '20\n');
  write(join(t.sys, 'kernel/mm/zswap/stored_pages'), '0\n');
  write(join(t.sys, 'kernel/mm/zswap/pool_limit_hit'), '0\n');
  write(join(t.sys, 'kernel/mm/zswap/written_back_pages'), '0\n');
  write(join(t.sys, 'kernel/mm/numa/demotion_enabled'), '0\n');
  write(join(t.proc, 'sys/kernel/numa_balancing'), '0\n');
  mkdirSync(join(t.sys, 'kernel/mm/damon'), { recursive: true });
  mkdirSync(join(t.sys, 'module/damon_tier/parameters'), { recursive: true });
  write(join(t.sys, 'module/damon_tier/parameters/enabled'), '0\n');
  mkdirSync(join(t.sys, 'kernel/mm/mempolicy/weighted_interleave'), { recursive: true });
  write(join(t.sys, 'kernel/mm/mempolicy/weighted_interleave/node0'), '1\n');
  write(join(t.sys, 'kernel/mm/mempolicy/weighted_interleave/node2'), '1\n');
  mkdirSync(join(t.sys, 'devices/system/package'), { recursive: true });
  mkdirSync(join(t.sys, 'kernel/mm/pghot'), { recursive: true });
  write(join(t.sys, 'kernel/mm/hugepages/hugepages-2048kB/nr_hugepages'), '0\n');
  write(join(t.sys, 'kernel/mm/hugepages/hugepages-2048kB/free_hugepages'), '0\n');
  write(join(t.sys, 'kernel/mm/hugepages/hugepages-1048576kB/nr_hugepages'), '0\n');
  write(join(t.sys, 'kernel/mm/hugepages/hugepages-1048576kB/free_hugepages'), '0\n');

  return t;
}

describe('memory_tiering discover', () => {
  it('classifies CPU+DRAM nodes separately from memory-only CXL/PMem nodes', () => {
    const t = populatedHardware();
    const inv = py<{
      dramNodes: number[];
      memoryOnlyNodes: number[];
      cxlDevices: string[];
      daxDevices: string[];
    }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'print(json.dumps({',
        '  "dramNodes": inv["dramNodes"],',
        '  "memoryOnlyNodes": inv["memoryOnlyNodes"],',
        '  "cxlDevices": [d["id"] for d in inv["cxlDevices"]],',
        '  "daxDevices": [d["id"] for d in inv["daxDevices"]],',
        '}))',
      ].join('\n'),
    );
    expect(inv.dramNodes).toEqual([0, 1]);
    expect(inv.memoryOnlyNodes).toEqual([2, 3]);
    expect(inv.cxlDevices).toContain('mem0');
    expect(inv.daxDevices).toContain('dax0.0');
  });

  it('detects kernel capabilities that exist now and ones reserved for future kernels', () => {
    const t = populatedHardware();
    const caps = py<Record<string, boolean>>(
      `print(json.dumps(mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})["capabilities"]))`,
    );
    expect(caps.demotion).toBe(true);
    expect(caps.numaBalancing).toBe(true);
    expect(caps.memoryTiersSysfs).toBe(true);
    expect(caps.zswap).toBe(true);
    expect(caps.damon).toBe(true);
    expect(caps.damonTier).toBe(true);
    expect(caps.weightedInterleave).toBe(true);
    expect(caps.packageAware).toBe(true);
    expect(caps.pghot).toBe(true);
    expect(caps.cxlDriver).toBe(true);
    expect(caps.daxKmem).toBe(true);
    expect(caps.cxlPoolingSwitch).toBe(true);
  });
});

describe('memory_tiering plan', () => {
  it('plans demotion, NUMA balancing tiering, DAX kmem, zswap, NVMe swap, and DAMON when hardware is present', () => {
    const t = populatedHardware();
    const plan = py<{ ops: string[]; waiting: string[] }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        'print(json.dumps({"ops": [a["op"] for a in plan["actions"]], "waiting": plan["waiting"]}))',
      ].join('\n'),
    );
    expect(plan.ops).toEqual(
      expect.arrayContaining([
        'enable_demotion',
        'enable_numa_balancing_tiering',
        'bind_dax_kmem',
        'enable_zswap',
        'prepare_nvme_swap',
        'enable_damon_tier',
        'prepare_hypervisor_nvme_dir',
      ]),
    );
    expect(plan.waiting).toEqual(expect.arrayContaining(['hbm', 'compressed-cxl']));
    expect(plan.waiting).not.toEqual(expect.arrayContaining(['cxl', 'phase-change', 'nvme-swap']));
  });

  it('does not select a mounted NVMe as the swap device', () => {
    const t = populatedHardware();
    const plan = py<{ swapDevice: string | null }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        'swap = next(a for a in plan["actions"] if a["op"] == "prepare_nvme_swap")',
        'print(json.dumps({"swapDevice": swap.get("device")}))',
      ].join('\n'),
    );
    expect(plan.swapDevice).toBe('/dev/nvme1n1');
  });

  it('records waiting_for_hardware instead of failing when CXL/PMem/NVMe are absent', () => {
    const t = buildTree('empty');
    write(join(t.proc, 'cmdline'), 'root=LABEL=COS_STATE\n');
    write(join(t.proc, 'meminfo'), 'MemTotal: 2048000 kB\nMemAvailable: 1024000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n');
    write(join(t.proc, 'vmstat'), 'nr_free_pages 1\n');
    write(join(t.proc, 'swaps'), 'Filename\tType\tSize\tUsed\tPriority\n');
    mkdirSync(join(t.sys, 'devices/system/node/node0'), { recursive: true });
    write(join(t.sys, 'devices/system/node/node0/cpulist'), '0\n');
    write(join(t.sys, 'devices/system/node/node0/meminfo'), 'Node 0 MemTotal: 2048000 kB\n');
    const plan = py<{ ops: string[]; waiting: string[] }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        'print(json.dumps({"ops": [a["op"] for a in plan["actions"]], "waiting": plan["waiting"]}))',
      ].join('\n'),
    );
    expect(plan.waiting).toEqual(
      expect.arrayContaining(['cxl', 'phase-change', 'nvme-swap', 'memory-only-numa']),
    );
    expect(plan.ops).not.toContain('bind_dax_kmem');
    expect(plan.ops).not.toContain('enable_demotion');
  });

  it('plans weighted interleave instead of demotion when policy is bandwidth', () => {
    const t = populatedHardware();
    const plan = py<{ ops: string[] }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        'cfg["policy"] = "bandwidth"',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        'print(json.dumps({"ops": [a["op"] for a in plan["actions"]]}))',
      ].join('\n'),
    );
    expect(plan.ops).toContain('enable_weighted_interleave');
    expect(plan.ops).not.toContain('enable_demotion');
  });

  it('honours nexus.features.memory_tiering=false on the kernel command line', () => {
    const t = populatedHardware();
    write(join(t.proc, 'cmdline'), 'root=/dev/sda nexus.features.memory_tiering=false\n');
    const plan = py<{ enabled: boolean; ops: string[] }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        `cfg = mt.config_from_cmdline(mt.default_config(), ${JSON.stringify(t.proc)})`,
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        'print(json.dumps({"enabled": cfg["enabled"], "ops": [a["op"] for a in plan["actions"]]}))',
      ].join('\n'),
    );
    expect(plan.enabled).toBe(false);
    expect(plan.ops).toEqual([]);
  });
});

describe('memory_tiering apply and metrics', () => {
  it('writes demotion and NUMA-balancing sysctls into the fake proc/sys tree', () => {
    const t = populatedHardware();
    const result = py<{ demotion: string; balancing: string; zswap: string }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        `applied = mt.apply_actions(plan["actions"], proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)}, run_root=${JSON.stringify(t.run)}, var_root=${JSON.stringify(t.varlib)}, dry_run=False)`,
        `demotion = open(${JSON.stringify(join(t.sys, 'kernel/mm/numa/demotion_enabled'))}).read().strip()`,
        `balancing = open(${JSON.stringify(join(t.proc, 'sys/kernel/numa_balancing'))}).read().strip()`,
        `zswap = open(${JSON.stringify(join(t.sys, 'module/zswap/parameters/enabled'))}).read().strip()`,
        'print(json.dumps({"demotion": demotion, "balancing": balancing, "zswap": zswap}))',
      ].join('\n'),
    );
    expect(result.demotion).toBe('1');
    expect(result.balancing).toBe('2');
    expect(['Y', '1']).toContain(result.zswap);
  });

  it('collects virtual memory, swap, zswap, PSI, demotion, and tier membership without fabricating zeros for missing files', () => {
    const t = populatedHardware();
    const metrics = py<{
      meminfo: { memTotalKb: number; swapTotalKb: number };
      vmstat: { pgdemoteKswapd: number; pgpromoteSuccess: number };
      psi: { memorySomeAvg10: number };
      tiers: { id: string; nodelist: string }[];
      zswap: { enabled: boolean | null; storedPages: number | null };
      missing: string | null;
    }>(
      [
        `m = mt.collect_metrics(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'print(json.dumps({',
        '  "meminfo": {"memTotalKb": m["meminfo"]["memTotalKb"], "swapTotalKb": m["meminfo"]["swapTotalKb"]},',
        '  "vmstat": {"pgdemoteKswapd": m["vmstat"]["pgdemoteKswapd"], "pgpromoteSuccess": m["vmstat"]["pgpromoteSuccess"]},',
        '  "psi": {"memorySomeAvg10": m["psi"]["memory"]["some"]["avg10"]},',
        '  "tiers": m["tiers"],',
        '  "zswap": {"enabled": m["zswap"]["enabled"], "storedPages": m["zswap"]["storedPages"]},',
        '  "missing": m["vmstat"].get("pgdemoteProactive"),',
        '}))',
      ].join('\n'),
    );
    expect(metrics.meminfo.memTotalKb).toBe(67108864);
    expect(metrics.meminfo.swapTotalKb).toBe(0);
    expect(metrics.vmstat.pgdemoteKswapd).toBe(12);
    expect(metrics.vmstat.pgpromoteSuccess).toBe(4);
    expect(metrics.psi.memorySomeAvg10).toBeCloseTo(1.0);
    expect(metrics.tiers.map((tier) => tier.nodelist).sort()).toEqual(['0-1', '2-3']);
    expect(metrics.zswap.enabled).toBe(false);
    expect(metrics.zswap.storedPages).toBe(0);
    expect(metrics.missing).toBeNull();
  });

  it('builds a live dashboard slice whose tiers include DRAM, CXL, phase-change, zswap, and swap', () => {
    const t = populatedHardware();
    const dash = py<{ ids: string[]; waiting: string[] }>(
      [
        `inv = mt.discover(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)})`,
        'cfg = mt.default_config()',
        `plan = mt.plan(inv, cfg, proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)})`,
        `mt.apply_actions(plan["actions"], proc_root=${JSON.stringify(t.proc)}, sys_root=${JSON.stringify(t.sys)}, run_root=${JSON.stringify(t.run)}, var_root=${JSON.stringify(t.varlib)}, dry_run=False)`,
        `d = mt.dashboard_slice(inv, plan, mt.collect_metrics(${JSON.stringify(t.proc)}, ${JSON.stringify(t.sys)}), cfg)`,
        'print(json.dumps({"ids": [t["id"] for t in d["memoryTiers"]], "waiting": d["waitingForHardware"]}))',
      ].join('\n'),
    );
    expect(dash.ids).toEqual(expect.arrayContaining(['dram', 'cxl', 'phase-change', 'zswap', 'nvme', 'swap']));
  });
});

describe('memory_tiering kubevirt hints', () => {
  it('emits dram-only vs tierable VM hints and reserved guest CXL/NVDIMM annotations', () => {
    const hints = py<{ annotations: Record<string, string>; hugepagesTierable: boolean }>(
      'print(json.dumps({"annotations": mt.kubevirt_annotations(), "hugepagesTierable": mt.kubevirt_preference("tierable")["hugepages"]}))',
    );
    expect(hints.annotations['nexus.io/memory-tiering']).toBe('auto');
    expect(hints.annotations['nexus.io/guest-cxl']).toBe('reserved');
    expect(hints.annotations['nexus.io/guest-nvdimm']).toBe('reserved');
    expect(hints.hugepagesTierable).toBe(false);
  });
});

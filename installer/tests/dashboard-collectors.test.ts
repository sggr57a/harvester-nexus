/**
 * Live collector contracts: accelerator summary rides the same tick as CPU/RAM.
 *
 * Exercises cluster_metrics / dashboard_collectors against this host. Fake PCI
 * trees live in accelerator-inventory.test.ts; this file checks the BFF wiring.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const OVERLAY = resolve(__dirname, '../overlay/usr/lib/nexus');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-dash-collect-'));

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

function py<T>(snippet: string): T {
  const script = [`import json, sys`, `sys.path.insert(0, ${JSON.stringify(OVERLAY)})`, snippet].join('\n');
  const out = execFileSync('python3', ['-c', script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      NEXUS_TELEMETRY_STATE: join(workdir, 'telemetry-state.json'),
      NEXUS_HOST_SAMPLE_FILE: join(workdir, 'host-sample.json'),
    },
  });
  return JSON.parse(out) as T;
}

describe('accelerator summary on the CPU/RAM environment tick', () => {
  it('cluster_metrics._collect_accelerator_summary returns a compact pulse, never utilization', () => {
    const summary = py<{
      available: boolean;
      cards: number;
      hottestC: number | null;
      waitingForHardware: string[];
      devices: unknown[];
    }>(
      [
        'import cluster_metrics as cm',
        'print(json.dumps(cm._collect_accelerator_summary()))',
      ].join('\n'),
    );
    expect(summary.available).toBe(true);
    expect(summary.cards).toBeGreaterThanOrEqual(0);
    expect(summary.hottestC === null || typeof summary.hottestC === 'number').toBe(true);
    expect(summary.waitingForHardware.length).toBeGreaterThan(0);
    expect(Array.isArray(summary.devices)).toBe(true);
  });

  it('collect_environment attaches accelerators next to cpuPercent and ramPercent', () => {
    const payload = py<{
      skipped?: boolean;
      cpuPercent: number | null;
      ramPercent: number | null;
      accelerators?: { cards: number; hottestC: number | null; waitingForHardware: string[] };
      metricSources?: Record<string, string>;
    }>(
      [
        'import cluster_metrics as cm',
        'if not cm._find_kubeconfig():',
        '    print(json.dumps({"skipped": True}))',
        'else:',
        '    env = cm.collect_environment()',
        '    print(json.dumps({',
        '        "skipped": False,',
        '        "cpuPercent": env.get("cpuPercent"),',
        '        "ramPercent": env.get("ramPercent"),',
        '        "accelerators": env.get("accelerators"),',
        '        "metricSources": env.get("metricSources"),',
        '    }))',
      ].join('\n'),
    );
    if (payload.skipped) return;
    expect(payload.accelerators).toBeDefined();
    expect(payload.accelerators?.cards).toBeGreaterThanOrEqual(0);
    expect(payload.metricSources?.accelerators).toMatch(/sysfs-pci|unavailable/);
    expect('cpuPercent' in payload).toBe(true);
    expect('ramPercent' in payload).toBe(true);
  });

  it('collect_environment attaches storageIops from /proc/diskstats next to CPU/RAM', () => {
    const payload = py<{
      skipped?: boolean;
      storageIops?: {
        totalIops: number | null;
        readIops: number | null;
        writeIops: number | null;
        devices: unknown[];
        source?: string;
      };
      totalIops: number | null;
    }>(
      [
        'import cluster_metrics as cm, time',
        'if not cm._find_kubeconfig():',
        '    print(json.dumps({"skipped": True}))',
        'else:',
        '    cm.collect_environment()',
        '    time.sleep(1.05)',
        '    env = cm.collect_environment()',
        '    print(json.dumps({',
        '        "skipped": False,',
        '        "storageIops": env.get("storageIops"),',
        '        "totalIops": env.get("totalIops"),',
        '    }))',
      ].join('\n'),
    );
    if (payload.skipped) return;
    expect(payload.storageIops).toBeDefined();
    expect(Array.isArray(payload.storageIops?.devices)).toBe(true);
    expect(payload.totalIops).toBe(payload.storageIops?.totalIops ?? null);
    if ((payload.storageIops?.devices.length ?? 0) > 0) {
      expect(typeof payload.storageIops?.totalIops).toBe('number');
      expect(payload.storageIops?.source).toMatch(/diskstats/);
    } else {
      expect(payload.storageIops?.totalIops ?? null).toBeNull();
    }
  }, 15000);

  it('collect_dashboards_live includes environment.accelerators and acceleration inventory', () => {
    const payload = py<{
      skipped?: boolean;
      error?: string;
      envCards?: number;
      envHottest?: number | null;
      accelAvailable?: boolean;
      accelDevices?: number;
    }>(
      [
        'import cluster_metrics as cm',
        'if not cm._find_kubeconfig():',
        '    print(json.dumps({"skipped": True}))',
        'else:',
        '    import dashboard_collectors as dc',
        '    live = dc.collect_dashboards_live()',
        '    env = live.get("environment") or {}',
        '    accel = live.get("acceleration") or {}',
        '    summary = env.get("accelerators") or {}',
        '    print(json.dumps({',
        '        "skipped": False,',
        '        "envCards": summary.get("cards"),',
        '        "envHottest": summary.get("hottestC"),',
        '        "accelAvailable": accel.get("available"),',
        '        "accelDevices": len(accel.get("passThrough") or accel.get("devices") or []),',
        '    }))',
      ].join('\n'),
    );
    if (payload.skipped) return;
    expect(payload.error).toBeUndefined();
    expect(payload.envCards).toBeGreaterThanOrEqual(0);
    expect(payload.envHottest === null || typeof payload.envHottest === 'number').toBe(true);
    expect(payload.accelAvailable).toBe(true);
    expect(payload.accelDevices).toBeGreaterThanOrEqual(0);
  });
});

describe('storage IOPS on the CPU/RAM environment tick', () => {
  it('collect_dashboards_live includes environment.storageIops rather than fabricating CSI rates', () => {
    const payload = py<{
      skipped?: boolean;
      error?: string;
      totalIops: number | null;
      storageTotal?: number | null;
      storageSource?: string;
      backendIops?: number;
      devices?: number;
    }>(
      [
        'import cluster_metrics as cm',
        'if not cm._find_kubeconfig():',
        '    print(json.dumps({"skipped": True}))',
        'else:',
        '    import dashboard_collectors as dc',
        '    live = dc.collect_dashboards_live()',
        '    env = live.get("environment") or {}',
        '    storage = env.get("storageIops") or {}',
        '    backends = (live.get("storage") or {}).get("backends") or []',
        '    print(json.dumps({',
        '        "skipped": False,',
        '        "totalIops": env.get("totalIops"),',
        '        "storageTotal": storage.get("totalIops"),',
        '        "storageSource": storage.get("source"),',
        '        "backendIops": (backends[0] or {}).get("iops") if backends else None,',
        '        "devices": len(storage.get("devices") or []),',
        '    }))',
      ].join('\n'),
    );
    if (payload.skipped) return;
    expect(payload.error).toBeUndefined();
    expect(payload.devices).toBeGreaterThanOrEqual(0);
    expect(payload.totalIops).toBe(payload.storageTotal ?? null);
    expect(payload.storageSource).toMatch(/diskstats|unavailable/);
    if (payload.backendIops != null) {
      expect(payload.backendIops).toBe(0);
    }
  });
});

/**
 * Contract tests for installer/overlay/usr/lib/nexus/accelerator_inventory.py.
 *
 * Fake /sys PCI trees only — no FPGA/NPU/TPU hardware required.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/accelerator_inventory.py');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-accel-'));

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

function py<T>(snippet: string): T {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location("ai", ${JSON.stringify(MODULE)})`,
    'ai = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(ai)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8' });
  return JSON.parse(out) as T;
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function pciDevice(
  sys: string,
  bdf: string,
  opts: {
    vendor: string;
    device: string;
    classCode: string;
    driver?: string;
    numa?: string;
    iommu?: string;
    currentSpeed?: string;
    currentWidth?: string;
    maxSpeed?: string;
    maxWidth?: string;
    aerCorrectable?: string;
    aerUncorrectable?: string;
    tempMilliC?: string;
    runtime?: string;
  },
): string {
  const root = join(sys, 'bus/pci/devices', bdf);
  write(join(root, 'vendor'), `0x${opts.vendor}\n`);
  write(join(root, 'device'), `0x${opts.device}\n`);
  write(join(root, 'class'), `0x${opts.classCode}\n`);
  write(join(root, 'numa_node'), `${opts.numa ?? '0'}\n`);
  write(join(root, 'current_link_speed'), `${opts.currentSpeed ?? '16.0 GT/s PCIe'}\n`);
  write(join(root, 'current_link_width'), `${opts.currentWidth ?? '16'}\n`);
  write(join(root, 'max_link_speed'), `${opts.maxSpeed ?? '32.0 GT/s PCIe'}\n`);
  write(join(root, 'max_link_width'), `${opts.maxWidth ?? '16'}\n`);
  write(join(root, 'power/runtime_status'), `${opts.runtime ?? 'active'}\n`);
  if (opts.iommu) {
    mkdirSync(join(sys, 'kernel/iommu_groups', opts.iommu), { recursive: true });
    symlinkSync(join(sys, 'kernel/iommu_groups', opts.iommu), join(root, 'iommu_group'));
  }
  if (opts.driver) {
    const drv = join(sys, 'bus/pci/drivers', opts.driver);
    mkdirSync(drv, { recursive: true });
    symlinkSync(drv, join(root, 'driver'));
  }
  if (opts.aerCorrectable) {
    write(join(root, 'aer_dev_correctable'), opts.aerCorrectable);
  }
  if (opts.aerUncorrectable) {
    write(join(root, 'aer_dev_fatal'), opts.aerUncorrectable);
  }
  if (opts.tempMilliC) {
    write(join(root, 'hwmon/hwmon0/temp1_input'), `${opts.tempMilliC}\n`);
  }
  return root;
}

describe('accelerator inventory · empty host', () => {
  it('lists allowlisted families as waitingForHardware and invents no devices', () => {
    const sys = join(workdir, 'empty', 'sys');
    mkdirSync(join(sys, 'bus/pci/devices'), { recursive: true });
    const dash = py<{ devices: unknown[]; waitingForHardware: string[]; available: boolean }>(
      `print(json.dumps(ai.live_dashboard(sys_root=${JSON.stringify(sys)})))`,
    );
    expect(dash.available).toBe(true);
    expect(dash.devices).toEqual([]);
    expect(dash.waitingForHardware).toEqual(
      expect.arrayContaining(['npu-gaudi', 'npu-qaic', 'tpu-coral', 'fpga-alveo', 'fpga-intel-dfl']),
    );
  });
});

describe('accelerator inventory · allowlisted cards', () => {
  it('classifies Gaudi 3 PCIe, Coral TPU, and Alveo FPGA with measured link/AER/temp', () => {
    const sys = join(workdir, 'cards', 'sys');
    mkdirSync(join(sys, 'bus/pci/devices'), { recursive: true });
    pciDevice(sys, '0000:3d:00.0', {
      vendor: '1da3',
      device: '1063',
      classCode: '120000',
      driver: 'vfio-pci',
      iommu: '12',
      currentSpeed: '16.0 GT/s PCIe',
      maxSpeed: '32.0 GT/s PCIe',
      aerCorrectable: 'RxErr 4\nBadTLP 0\n',
      tempMilliC: '62000',
    });
    pciDevice(sys, '0000:04:00.0', {
      vendor: '1ac1',
      device: '089a',
      classCode: '088000',
      driver: 'apex',
      iommu: '8',
      currentSpeed: '5.0 GT/s PCIe',
      maxSpeed: '5.0 GT/s PCIe',
      currentWidth: '1',
      maxWidth: '1',
    });
    pciDevice(sys, '0000:81:00.0', {
      vendor: '10ee',
      device: '5000',
      classCode: '120000',
      driver: 'vfio-pci',
      numa: '1',
      iommu: '21',
      currentSpeed: '16.0 GT/s PCIe',
      maxSpeed: '16.0 GT/s PCIe',
    });

    const dash = py<{
      devices: Array<{
        bdf: string;
        kind: string;
        model: string;
        driver: string | null;
        utilizationPercent: number | null;
        temperatureC: number | null;
        aerCorrectable: number | null;
        linkDownshifted: boolean;
        issues: string[];
      }>;
      waitingForHardware: string[];
      issues: string[];
    }>(`print(json.dumps(ai.live_dashboard(sys_root=${JSON.stringify(sys)})))`);

    const byBdf = Object.fromEntries(dash.devices.map((d) => [d.bdf, d]));
    expect(byBdf['0000:3d:00.0'].kind).toBe('npu');
    expect(byBdf['0000:3d:00.0'].model).toMatch(/Gaudi 3/);
    expect(byBdf['0000:3d:00.0'].driver).toBe('vfio-pci');
    expect(byBdf['0000:3d:00.0'].utilizationPercent).toBeNull();
    expect(byBdf['0000:3d:00.0'].temperatureC).toBe(62);
    expect(byBdf['0000:3d:00.0'].aerCorrectable).toBe(4);
    expect(byBdf['0000:3d:00.0'].linkDownshifted).toBe(true);
    expect(byBdf['0000:3d:00.0'].issues).toEqual(expect.arrayContaining(['pcie-link-downshifted', 'aer-correctable']));

    expect(byBdf['0000:04:00.0'].kind).toBe('tpu');
    expect(byBdf['0000:81:00.0'].kind).toBe('fpga');
    expect(dash.waitingForHardware).not.toContain('npu-gaudi');
    expect(dash.waitingForHardware).not.toContain('tpu-coral');
    expect(dash.waitingForHardware).not.toContain('fpga-alveo');
    expect(dash.issues.length).toBeGreaterThan(0);
  });

  it('does not claim Intel NICs or NVIDIA NICs; does claim display-class NVIDIA GPUs', () => {
    const sys = join(workdir, 'filter', 'sys');
    mkdirSync(join(sys, 'bus/pci/devices'), { recursive: true });
    pciDevice(sys, '0000:01:00.0', { vendor: '8086', device: '1521', classCode: '020000' });
    pciDevice(sys, '0000:02:00.0', { vendor: '10de', device: '22a3', classCode: '020000' });
    pciDevice(sys, '0000:03:00.0', { vendor: '10de', device: '2330', classCode: '030200', driver: 'vfio-pci' });
    pciDevice(sys, '0000:d8:00.0', { vendor: '17cb', device: 'a100', classCode: '120000', driver: 'qaic' });

    const dash = py<{ devices: Array<{ bdf: string; kind: string }> }>(
      `print(json.dumps(ai.live_dashboard(sys_root=${JSON.stringify(sys)})))`,
    );
    const bdfs = dash.devices.map((d) => d.bdf);
    expect(bdfs).toContain('0000:03:00.0');
    expect(bdfs).toContain('0000:d8:00.0');
    expect(bdfs).not.toContain('0000:01:00.0');
    expect(bdfs).not.toContain('0000:02:00.0');
    expect(dash.devices.find((d) => d.bdf === '0000:03:00.0')?.kind).toBe('gpu');
    expect(dash.devices.find((d) => d.bdf === '0000:d8:00.0')?.kind).toBe('npu');
  });

  it('follows Intel DFL fpga_region sysfs to the parent PCI device', () => {
    const sys = join(workdir, 'dfl', 'sys');
    mkdirSync(join(sys, 'bus/pci/devices'), { recursive: true });
    const pci = pciDevice(sys, '0000:af:00.0', {
      vendor: '8086',
      device: '0b30',
      classCode: '120000',
      driver: 'dfl-pci',
    });
    const region = join(sys, 'class/fpga_region/region0');
    mkdirSync(region, { recursive: true });
    symlinkSync(pci, join(region, 'device'));

    const dash = py<{ devices: Array<{ bdf: string; kind: string; model: string }>; waitingForHardware: string[] }>(
      `print(json.dumps(ai.live_dashboard(sys_root=${JSON.stringify(sys)})))`,
    );
    expect(dash.devices).toEqual(
      expect.arrayContaining([expect.objectContaining({ bdf: '0000:af:00.0', kind: 'fpga' })]),
    );
    expect(dash.waitingForHardware).not.toContain('fpga-intel-dfl');
  });

  it('flags missing IOMMU and unbound driver as issues', () => {
    const sys = join(workdir, 'issues', 'sys');
    mkdirSync(join(sys, 'bus/pci/devices'), { recursive: true });
    pciDevice(sys, '0000:05:00.0', {
      vendor: '1da3',
      device: '1020',
      classCode: '120000',
    });
    const dash = py<{ devices: Array<{ issues: string[] }>; issues: string[] }>(
      `print(json.dumps(ai.live_dashboard(sys_root=${JSON.stringify(sys)})))`,
    );
    expect(dash.devices[0].issues).toEqual(expect.arrayContaining(['no-driver', 'no-iommu']));
    expect(dash.issues.join(' ')).toMatch(/no-driver|no-iommu/);
  });
});

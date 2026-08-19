import { describe, expect, it } from 'vitest';
import { buildAccelerationDashboard } from '../dashboards';
import {
  hardwareAddOnTotals,
  hardwareTickerCells,
  summarizeFromPassThrough,
} from './hardwareAddOn';

describe('summarizeFromPassThrough', () => {
  it('counts cards by kind, hottest measured temp, and issues without inventing utilization', () => {
    const summary = summarizeFromPassThrough(
      [
        {
          id: '0000:3d:00.0',
          kind: 'npu',
          model: 'Intel Gaudi 3 PCIe',
          boundTo: 'vfio-pci',
          driver: 'vfio-pci',
          utilizationPercent: null,
          memoryGiB: null,
          temperatureC: 62,
          issues: ['pcie-link-downshifted'],
        },
        {
          id: '0000:81:00.0',
          kind: 'fpga',
          model: 'AMD Alveo / Xilinx FPGA',
          boundTo: 'vfio-pci',
          driver: 'vfio-pci',
          utilizationPercent: null,
          memoryGiB: null,
          temperatureC: 48,
          issues: [],
        },
      ],
      ['tpu-coral'],
    );
    expect(summary.cards).toBe(2);
    expect(summary.byKind).toEqual({ npu: 1, fpga: 1 });
    expect(summary.hottestC).toBe(62);
    expect(summary.issues).toBe(1);
    expect(summary.waitingForHardware).toEqual(['tpu-coral']);
    expect(summary.devices.every((d) => d.kind === 'npu' || d.kind === 'fpga')).toBe(true);
  });

  it('keeps hottestC null when no card reports temperature', () => {
    const summary = summarizeFromPassThrough(
      [
        {
          id: '0000:04:00.0',
          kind: 'tpu',
          model: 'Google Coral Edge TPU',
          boundTo: 'unbound',
          driver: 'none',
          utilizationPercent: null,
          memoryGiB: null,
          temperatureC: null,
          issues: ['no-driver'],
        },
      ],
      [],
    );
    expect(summary.hottestC).toBeNull();
    expect(summary.cards).toBe(1);
    expect(summary.issues).toBe(1);
  });
});

describe('hardwareTickerCells', () => {
  it('sits next to CPU/RAM with card count, issues, and hottest temp (or dash)', () => {
    const cells = hardwareTickerCells({
      cards: 3,
      issues: 2,
      hottestC: 71,
      byKind: { gpu: 1, npu: 1, fpga: 1 },
      waitingForHardware: ['tpu-coral'],
      devices: [],
    });
    const labels = cells.map((c) => c.label);
    expect(labels).toEqual(['Accel cards', 'Accel issues', 'Accel °C']);
    expect(cells[0].value).toBe('3');
    expect(cells[0].sub).toMatch(/gpu/i);
    expect(cells[1].value).toBe('2');
    expect(cells[2].value).toBe('71°');
  });

  it('renders a dash for hottest temp when no hwmon reading exists', () => {
    const cells = hardwareTickerCells({
      cards: 0,
      issues: 0,
      hottestC: null,
      byKind: {},
      waitingForHardware: ['npu-gaudi'],
      devices: [],
    });
    expect(cells[0].value).toBe('0');
    expect(cells[2].value).toBe('—');
    expect(cells[0].sub).toMatch(/waiting/i);
  });
});

describe('hardwareAddOnTotals', () => {
  it('emits the same compact totals used beside CPU/RAM on hardware dashboards', () => {
    const totals = hardwareAddOnTotals({
      cards: 2,
      issues: 1,
      hottestC: 62,
      byKind: { npu: 1, fpga: 1 },
      waitingForHardware: [],
      devices: [],
    });
    expect(totals).toEqual([
      { label: 'Accel', value: '2' },
      { label: 'Accel issues', value: '1' },
      { label: 'Accel °C', value: '62°' },
    ]);
  });

  it('summarizes the demo catalog pass-through rows so demo dashboards stay consistent', () => {
    const demo = summarizeFromPassThrough(buildAccelerationDashboard().passThrough);
    expect(demo.cards).toBeGreaterThan(0);
    expect(demo.byKind.gpu).toBeGreaterThan(0);
    expect(demo.byKind.fpga).toBeGreaterThan(0);
    expect(demo.byKind.tpu).toBeGreaterThan(0);
  });
});

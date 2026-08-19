import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const src = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * CPU / RAM hardware views must import the shared add-in card strip so FPGA /
 * GPU / NPU / TPU cannot fall off those dashboards without a test failure.
 */
describe('hardware dashboards include add-in card metrics next to CPU/RAM', () => {
  const views: Array<{ file: string; mustInclude: RegExp[] }> = [
    {
      file: 'src/components/EnvironmentTicker.tsx',
      mustInclude: [/hardwareTickerCells/, /snapshot\.accelerators/],
    },
    {
      file: 'src/components/dashboards/Dashboards.tsx',
      mustInclude: [/HardwareAddOnTotals/, /HardwareAddOnPanel/, /telemetry\?\.accelerators/],
    },
    {
      file: 'src/components/dashboards/ResourceMonitorHudView.tsx',
      mustInclude: [/HardwareAddOnTotals/, /HardwareAddOnPanel/, /accelerators/],
    },
    {
      file: 'src/components/dashboards/EnvironmentIntelHudView.tsx',
      mustInclude: [/HardwareAddOnTotals/, /HardwareAddOnPanel/, /accelerators/],
    },
    {
      file: 'src/components/dashboards/MissionControl.tsx',
      mustInclude: [/HardwareAddOnTotals/, /HardwareAddOnPanel/, /accelerators/],
    },
    {
      file: 'src/components/dashboards/TelemetryWave.tsx',
      mustInclude: [/HardwareAddOnTotals/, /HardwareAddOnPanel/, /accelerators/],
    },
  ];

  it.each(views)('$file wires accelerator metrics', ({ file, mustInclude }) => {
    const text = src(file);
    for (const pattern of mustInclude) {
      expect(text).toMatch(pattern);
    }
  });
});

describe('hardware dashboards include measured storage IOPS next to CPU/RAM', () => {
  const views: Array<{ file: string; mustInclude: RegExp[] }> = [
    {
      file: 'src/components/EnvironmentTicker.tsx',
      mustInclude: [/storageIopsTickerCells/, /formatMetric\(snapshot, 'totalIops'/, /snapshot\.storageIops/],
    },
    {
      file: 'src/components/dashboards/Dashboards.tsx',
      mustInclude: [/StorageIopsTotals/, /StorageIopsPanel/, /telemetry\?\.storageIops/],
    },
    {
      file: 'src/components/dashboards/ResourceMonitorHudView.tsx',
      mustInclude: [/StorageIopsTotals/, /StorageIopsPanel/, /storageIops/],
    },
    {
      file: 'src/components/dashboards/EnvironmentIntelHudView.tsx',
      mustInclude: [/StorageIopsTotals/, /StorageIopsPanel/, /storageIops/],
    },
    {
      file: 'src/components/dashboards/MissionControl.tsx',
      mustInclude: [/StorageIopsTotals/, /StorageIopsPanel/, /storageIops/],
    },
    {
      file: 'src/components/dashboards/TelemetryWave.tsx',
      mustInclude: [/StorageIopsTotals/, /StorageIopsPanel/, /storageIops/],
    },
  ];

  it.each(views)('$file wires storage IOPS metrics', ({ file, mustInclude }) => {
    const text = src(file);
    for (const pattern of mustInclude) {
      expect(text).toMatch(pattern);
    }
  });

  it('Storage dashboard does not present live CSI backend IOPS as measured zeros', () => {
    const text = src('src/components/dashboards/Dashboards.tsx');
    expect(text).toMatch(/isLive \? '—' : backend\.iops\.toLocaleString\(\)/);
    expect(text).toMatch(/StorageIopsPanel summary=\{telemetry\?\.storageIops\}/);
  });
});

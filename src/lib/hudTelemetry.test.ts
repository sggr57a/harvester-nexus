import { describe, expect, it } from 'vitest';
import { buildHudTelemetry } from './hudTelemetry';

describe('buildHudTelemetry', () => {
  it('returns active dashboard telemetry for the default Nexus demo', () => {
    const telemetry = buildHudTelemetry();

    expect(telemetry.metrics).toHaveLength(8);
    expect(telemetry.metrics.every((metric) => metric.value >= 0 && metric.value <= 100)).toBe(true);
    expect(telemetry.storageRings.map((ring) => ring.label)).toEqual(['Ceph', 'Longhorn', 'NVMe-oF']);
    expect(telemetry.lineSeries).toHaveLength(12);
    expect(telemetry.toggles.filter((toggle) => toggle.enabled).map((toggle) => toggle.label)).toContain('vCluster');
    expect(telemetry.menuModes).toEqual(['Overview', 'Validate', 'Deploy', 'Observe']);
    expect(telemetry.navigationTabs.map((tab) => tab.id)).toEqual(['dashboard', 'active-work', 'security', 'storage']);
    expect(telemetry.graphWidgets.every((widget) => widget.drawDelayMs >= 0)).toBe(true);
    expect(telemetry.graphWidgets.some((widget) => widget.renderMode === 'radial')).toBe(true);
    expect(telemetry.controlSurfaces.map((surface) => surface.animation)).toEqual(['unfold', 'expand', 'collapse']);
    expect(telemetry.controlSurfaces.every((surface) => surface.options.length >= 3)).toBe(true);
    expect(telemetry.statusRails).toHaveLength(6);
    expect(telemetry.radioGroups.flatMap((group) => group.options)).toHaveLength(12);
    expect(telemetry.scanPanels.map((panel) => panel.label)).toEqual(['Volume scan', 'Mesh scan']);
    expect(telemetry.microLabels).toContain('X_300.1');
    expect(telemetry.eventFeed[0]).toContain('control-plane');
  });
});

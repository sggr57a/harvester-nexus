import { describe, expect, it } from 'vitest';
import {
  aggregatePostureScore,
  projectCompliancePosture,
  syntheticCompliancePosture,
} from './compliancePosture';
import type { CompliancePosture } from './xdr/types';

const NOW = 1_700_000_000_000;

function posture(over: Partial<CompliancePosture>): CompliancePosture {
  return {
    framework: 'cis-k8s',
    controlsTotal: 100,
    controlsCovered: 80,
    hardeningScore: 80,
    scannedAtMs: NOW,
    scanner: 'kube-bench',
    ...over,
  };
}

describe('compliancePosture · projectCompliancePosture', () => {
  it('always returns the 5 tracked frameworks even if the engine produced no scans', () => {
    const rings = projectCompliancePosture({ postures: [] });
    const frameworks = rings.map((r) => r.framework);
    expect(frameworks).toEqual(['cis-k8s', 'pci-dss', 'nist-800-53', 'iso-27001', 'soc2']);
    for (const r of rings) {
      expect(r.coveragePercent).toBe(0);
      expect(r.status).toBe('critical');
    }
  });

  it('uses the latest posture per framework and computes trend delta', () => {
    const postures: CompliancePosture[] = [
      posture({ framework: 'cis-k8s', hardeningScore: 70, scannedAtMs: NOW - 86_400_000 }),
      posture({ framework: 'cis-k8s', hardeningScore: 84, scannedAtMs: NOW }),
    ];
    const rings = projectCompliancePosture({ postures });
    const cis = rings.find((r) => r.framework === 'cis-k8s')!;
    expect(cis.coveragePercent).toBe(84);
    expect(cis.trendDelta).toBe(14);
    expect(cis.status).toBe('warning');
  });

  it('classifies status correctly across the boundaries', () => {
    const cases: Array<[number, 'critical' | 'warning' | 'good']> = [
      [0, 'critical'],
      [69, 'critical'],
      [70, 'warning'],
      [84, 'warning'],
      [85, 'good'],
      [100, 'good'],
    ];
    for (const [score, expected] of cases) {
      const rings = projectCompliancePosture({
        postures: [posture({ framework: 'cis-k8s', hardeningScore: score })],
      });
      expect(rings.find((r) => r.framework === 'cis-k8s')!.status).toBe(expected);
    }
  });

  it('handles a missing previous scan as zero trend delta', () => {
    const rings = projectCompliancePosture({
      postures: [posture({ framework: 'pci-dss', hardeningScore: 78 })],
    });
    expect(rings.find((r) => r.framework === 'pci-dss')!.trendDelta).toBe(0);
  });

  it('frameworks not in ALWAYS_TRACKED are dropped from the output', () => {
    const rings = projectCompliancePosture({
      postures: [posture({ framework: 'cis-docker', hardeningScore: 95 })],
    });
    expect(rings.find((r) => r.framework === ('cis-docker' as never))).toBeUndefined();
    expect(rings.length).toBe(5);
  });
});

describe('compliancePosture · aggregatePostureScore', () => {
  it('returns 0 when no rings have scores yet', () => {
    expect(aggregatePostureScore(projectCompliancePosture({ postures: [] }))).toBe(0);
  });

  it('averages only the frameworks that have data', () => {
    const rings = projectCompliancePosture({
      postures: [
        posture({ framework: 'cis-k8s', hardeningScore: 80 }),
        posture({ framework: 'pci-dss', hardeningScore: 90 }),
      ],
    });
    expect(aggregatePostureScore(rings)).toBe(85);
  });
});

describe('compliancePosture · syntheticCompliancePosture', () => {
  it('produces 2 scans per tracked framework', () => {
    const data = syntheticCompliancePosture(0);
    expect(data.length).toBe(10);
    const distinct = new Set(data.map((d) => d.framework));
    expect(distinct.size).toBe(5);
  });

  it('the projected rings have non-zero coverage for every tracked framework', () => {
    const rings = projectCompliancePosture({ postures: syntheticCompliancePosture(0) });
    for (const r of rings) expect(r.coveragePercent).toBeGreaterThan(0);
  });
});

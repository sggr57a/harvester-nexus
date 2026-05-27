/**
 * Compliance posture projection.
 *
 * Takes the cluster's compliance scan results (kube-bench, OpenSCAP, Lynis,
 * etc.) and produces a per-framework summary suitable for the Mission Control
 * `CompliancePostureRings` widget. Pure data — no React.
 */

import type { ComplianceFramework, CompliancePosture } from './xdr/types';

export interface CompliancePostureRing {
  framework: ComplianceFramework;
  /** Display label (the framework names are kebab-case identifiers). */
  label: string;
  /** Current control-coverage percentage 0..100. */
  coveragePercent: number;
  /** Trend delta in percentage points vs the previous scan
   *  (positive = improving). */
  trendDelta: number;
  /** Severity bucket — drives the colour on the gauge. */
  status: 'critical' | 'warning' | 'good';
  /** ISO date / timestamp of the most recent scan. */
  scannedAtMs: number;
  /** Tool that produced the scan (kube-bench / OpenSCAP / Lynis / etc.). */
  scanner: string;
  /** Total controls evaluated. */
  controlsTotal: number;
  /** Controls passing. */
  controlsCovered: number;
}

const ALWAYS_TRACKED: { framework: ComplianceFramework; label: string }[] = [
  { framework: 'cis-k8s', label: 'CIS K8S' },
  { framework: 'pci-dss', label: 'PCI-DSS' },
  { framework: 'nist-800-53', label: 'NIST 800-53' },
  { framework: 'iso-27001', label: 'ISO 27001' },
  { framework: 'soc2', label: 'SOC 2' },
];

/** Rank framework status by score. */
function statusFor(percent: number): CompliancePostureRing['status'] {
  if (percent >= 85) return 'good';
  if (percent >= 70) return 'warning';
  return 'critical';
}

export interface ProjectComplianceInput {
  /** All compliance posture samples produced by the engine across time —
   *  the projection picks the latest per framework and computes the
   *  trend delta from the second-latest. */
  postures: CompliancePosture[];
}

export function projectCompliancePosture({ postures }: ProjectComplianceInput): CompliancePostureRing[] {
  const byFramework = new Map<ComplianceFramework, CompliancePosture[]>();
  for (const p of postures) {
    const arr = byFramework.get(p.framework) ?? [];
    arr.push(p);
    byFramework.set(p.framework, arr);
  }
  for (const arr of byFramework.values()) {
    arr.sort((a, b) => a.scannedAtMs - b.scannedAtMs);
  }

  return ALWAYS_TRACKED.map(({ framework, label }) => {
    const arr = byFramework.get(framework) ?? [];
    const latest = arr[arr.length - 1];
    const previous = arr[arr.length - 2];
    const coveragePercent = latest ? latest.hardeningScore : 0;
    const trendDelta = latest && previous ? latest.hardeningScore - previous.hardeningScore : 0;
    return {
      framework,
      label,
      coveragePercent,
      trendDelta,
      status: statusFor(coveragePercent),
      scannedAtMs: latest?.scannedAtMs ?? 0,
      scanner: latest?.scanner ?? '—',
      controlsTotal: latest?.controlsTotal ?? 0,
      controlsCovered: latest?.controlsCovered ?? 0,
    };
  });
}

/** Aggregate posture score across all tracked frameworks (mean coverage). */
export function aggregatePostureScore(rings: CompliancePostureRing[]): number {
  const scored = rings.filter((r) => r.coveragePercent > 0);
  if (scored.length === 0) return 0;
  return Math.round(scored.reduce((s, r) => s + r.coveragePercent, 0) / scored.length);
}

/** Demo-mode posture seed — used by Mission Control when the XDR engine
 *  hasn't actually run a scan yet (development / preview environments). */
export function syntheticCompliancePosture(seed: number = 0): CompliancePosture[] {
  const now = Date.now();
  // Deterministic-ish synthetic scores so the cards aren't blank in dev.
  const scores: Record<ComplianceFramework, number[]> = {
    'cis-k8s': [82, 84],
    'pci-dss': [76, 78],
    'nist-800-53': [88, 91],
    'iso-27001': [73, 70],
    'soc2': [86, 89],
    'cis-docker': [80, 82],
    'hipaa': [70, 72],
    'bsi-grundschutz': [76, 78],
    'nis2': [68, 71],
  };
  const out: CompliancePosture[] = [];
  for (const { framework } of ALWAYS_TRACKED) {
    const series = scores[framework] ?? [70, 72];
    const previous = series[(seed + 0) % series.length];
    const latest = series[(seed + 1) % series.length];
    out.push({
      framework,
      controlsTotal: 100,
      controlsCovered: previous,
      hardeningScore: previous,
      scannedAtMs: now - 24 * 3600_000,
      scanner: 'kube-bench',
    });
    out.push({
      framework,
      controlsTotal: 100,
      controlsCovered: latest,
      hardeningScore: latest,
      scannedAtMs: now,
      scanner: 'kube-bench',
    });
  }
  return out;
}

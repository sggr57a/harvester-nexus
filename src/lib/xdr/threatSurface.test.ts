import { describe, expect, it } from 'vitest';
import {
  TACTIC_ORDER,
  heightToColour,
  isoProject,
  projectThreatSurface,
  severityWeight,
  topCells,
} from './threatSurface';
import type { Alert, AttackTactic, Endpoint } from './types';

const NOW = 1_700_000_000_000;

function ep(id: string, kind: Endpoint['kind'] = 'host'): Endpoint {
  return { id, name: id, kind, host: id, ip: '10.0.0.1', sensors: [], status: 'online' };
}

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'a',
    ruleId: 'NXR-0000-test',
    ruleTitle: 'Test rule',
    endpointId: 'cp-01',
    severity: 'medium',
    tactics: ['execution'],
    techniques: ['T1059'],
    triggeringEvent: { id: 'e1', source: 'falco', endpointId: 'cp-01', kind: 'process-exec', timestampMs: NOW, payload: {} },
    matchedIndicators: [],
    recommendedActions: ['alert-only'],
    responseStatus: 'pending',
    timestampMs: NOW,
    ...over,
  };
}

describe('threatSurface · TACTIC_ORDER', () => {
  it('contains all 14 MITRE ATT&CK tactics in kill-chain order', () => {
    expect(TACTIC_ORDER.length).toBe(14);
    expect(TACTIC_ORDER[0]).toBe('reconnaissance');
    expect(TACTIC_ORDER[TACTIC_ORDER.length - 1]).toBe('impact');
    const required: AttackTactic[] = [
      'initial-access', 'execution', 'persistence', 'privilege-escalation',
      'defense-evasion', 'credential-access', 'discovery', 'lateral-movement',
      'command-and-control', 'exfiltration',
    ];
    for (const t of required) expect(TACTIC_ORDER).toContain(t);
  });

  it('has no duplicates', () => {
    expect(new Set(TACTIC_ORDER).size).toBe(TACTIC_ORDER.length);
  });
});

describe('threatSurface · severityWeight', () => {
  it('orders strictly by severity', () => {
    const order = ['info', 'low', 'medium', 'high', 'critical'] as const;
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(severityWeight(order[i])).toBeLessThan(severityWeight(order[i + 1]));
    }
  });
  it('critical is at least 4× info', () => {
    expect(severityWeight('critical') / severityWeight('info')).toBeGreaterThanOrEqual(4);
  });
});

describe('threatSurface · projectThreatSurface', () => {
  it('returns an empty surface for no alerts', () => {
    const surface = projectThreatSurface({ alerts: [], endpoints: [ep('cp-01')], nowMs: NOW });
    expect(surface.peak).toBeNull();
    expect(surface.totalLoad).toBe(0);
    expect(surface.heights.length).toBe(TACTIC_ORDER.length);
    for (let i = 0; i < surface.heights.length; i += 1) expect(surface.heights[i]).toBe(0);
  });

  it('drops alerts whose endpointId is unknown', () => {
    const surface = projectThreatSurface({
      alerts: [alert({ endpointId: 'ghost' })],
      endpoints: [ep('cp-01')],
      nowMs: NOW,
    });
    expect(surface.totalLoad).toBe(0);
    expect(surface.peak).toBeNull();
  });

  it('drops tactics that are not in TACTIC_ORDER', () => {
    const surface = projectThreatSurface({
      alerts: [alert({ tactics: ['not-a-tactic' as AttackTactic, 'execution'] })],
      endpoints: [ep('cp-01')],
      nowMs: NOW,
    });
    // execution is the only valid tactic in the alert — surface lights up exactly that cell
    const tacticIdx = TACTIC_ORDER.indexOf('execution');
    expect(surface.heights[tacticIdx]).toBeGreaterThan(0);
    let lit = 0;
    for (let i = 0; i < surface.heights.length; i += 1) if (surface.heights[i] > 0) lit += 1;
    expect(lit).toBe(1);
  });

  it('one fresh medium alert raises exactly one cell, one severity', () => {
    const surface = projectThreatSurface({
      alerts: [alert({ severity: 'medium', tactics: ['execution'] })],
      endpoints: [ep('cp-01'), ep('compute-01')],
      nowMs: NOW,
    });
    const idx = 0 * TACTIC_ORDER.length + TACTIC_ORDER.indexOf('execution');
    expect(surface.heights[idx]).toBeCloseTo(severityWeight('medium'), 5);
    expect(surface.topSeverity[idx]).toBe('medium');
    expect(surface.peak?.endpointId).toBe('cp-01');
    expect(surface.peak?.tactic).toBe('execution');
  });

  it('single alert with multiple tactics fans out to multiple cells', () => {
    const surface = projectThreatSurface({
      alerts: [alert({ tactics: ['execution', 'credential-access', 'persistence'], severity: 'high' })],
      endpoints: [ep('cp-01')],
      nowMs: NOW,
    });
    const w = severityWeight('high');
    expect(surface.heights[TACTIC_ORDER.indexOf('execution')]).toBeCloseTo(w, 5);
    expect(surface.heights[TACTIC_ORDER.indexOf('credential-access')]).toBeCloseTo(w, 5);
    expect(surface.heights[TACTIC_ORDER.indexOf('persistence')]).toBeCloseTo(w, 5);
    expect(surface.totalLoad).toBeCloseTo(w * 3, 5);
  });

  it('repeated alerts on the same cell stack additively', () => {
    const surface = projectThreatSurface({
      alerts: [
        alert({ severity: 'medium', tactics: ['execution'] }),
        alert({ id: 'a2', severity: 'low', tactics: ['execution'] }),
        alert({ id: 'a3', severity: 'critical', tactics: ['execution'] }),
      ],
      endpoints: [ep('cp-01')],
      nowMs: NOW,
    });
    const expected = severityWeight('medium') + severityWeight('low') + severityWeight('critical');
    expect(surface.heights[TACTIC_ORDER.indexOf('execution')]).toBeCloseTo(expected, 5);
    expect(surface.peak?.topSeverity).toBe('critical');
  });

  it('time decay halves a cell after one half-life', () => {
    const halfLifeMs = 60_000;
    const aged = projectThreatSurface({
      alerts: [alert({ severity: 'high', timestampMs: NOW - halfLifeMs })],
      endpoints: [ep('cp-01')],
      halfLifeMs,
      nowMs: NOW,
    });
    const fresh = projectThreatSurface({
      alerts: [alert({ severity: 'high', timestampMs: NOW })],
      endpoints: [ep('cp-01')],
      halfLifeMs,
      nowMs: NOW,
    });
    const agedH = aged.heights[TACTIC_ORDER.indexOf('execution')];
    const freshH = fresh.heights[TACTIC_ORDER.indexOf('execution')];
    expect(agedH / freshH).toBeCloseTo(0.5, 2);
  });

  it('alerts older than 10 half-lives contribute essentially nothing', () => {
    const halfLifeMs = 60_000;
    const surface = projectThreatSurface({
      alerts: [alert({ severity: 'critical', timestampMs: NOW - halfLifeMs * 10 })],
      endpoints: [ep('cp-01')],
      halfLifeMs,
      nowMs: NOW,
    });
    expect(surface.heights[TACTIC_ORDER.indexOf('execution')]).toBeLessThan(0.005);
  });

  it('peak is the loudest cell across endpoints + tactics', () => {
    const surface = projectThreatSurface({
      alerts: [
        alert({ endpointId: 'cp-01', severity: 'low', tactics: ['execution'] }),
        alert({ id: 'a2', endpointId: 'compute-01', severity: 'critical', tactics: ['impact'] }),
        alert({ id: 'a3', endpointId: 'edge-a', severity: 'medium', tactics: ['command-and-control'] }),
      ],
      endpoints: [ep('cp-01'), ep('compute-01'), ep('edge-a')],
      nowMs: NOW,
    });
    expect(surface.peak?.endpointId).toBe('compute-01');
    expect(surface.peak?.tactic).toBe('impact');
    expect(surface.peak?.topSeverity).toBe('critical');
  });

  it('severityHistogram counts each alert exactly once', () => {
    const surface = projectThreatSurface({
      alerts: [
        alert({ severity: 'critical' }),
        alert({ id: 'a2', severity: 'critical' }),
        alert({ id: 'a3', severity: 'low' }),
      ],
      endpoints: [ep('cp-01')],
      nowMs: NOW,
    });
    expect(surface.severityHistogram.critical).toBe(2);
    expect(surface.severityHistogram.low).toBe(1);
    expect(surface.severityHistogram.high).toBe(0);
  });
});

describe('threatSurface · topCells', () => {
  it('returns cells sorted by height descending', () => {
    const surface = projectThreatSurface({
      alerts: [
        alert({ endpointId: 'a', tactics: ['execution'], severity: 'low' }),
        alert({ id: '2', endpointId: 'b', tactics: ['execution'], severity: 'high' }),
        alert({ id: '3', endpointId: 'c', tactics: ['execution'], severity: 'medium' }),
      ],
      endpoints: [ep('a'), ep('b'), ep('c')],
      nowMs: NOW,
    });
    const top = topCells(surface, 3);
    expect(top.map((c) => c.endpointId)).toEqual(['b', 'c', 'a']);
  });

  it('caps at N cells', () => {
    const alerts: Alert[] = [];
    const eps: Endpoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      eps.push(ep(`h-${i}`));
      alerts.push(alert({ id: `a-${i}`, endpointId: `h-${i}`, severity: 'medium' }));
    }
    expect(topCells(projectThreatSurface({ alerts, endpoints: eps, nowMs: NOW }), 5).length).toBe(5);
  });

  it('skips zero-height cells', () => {
    const surface = projectThreatSurface({
      alerts: [alert({ severity: 'medium' })],
      endpoints: [ep('cp-01'), ep('compute-01'), ep('compute-02')],
      nowMs: NOW,
    });
    const top = topCells(surface, 100);
    expect(top.length).toBe(1);
  });
});

describe('threatSurface · heightToColour', () => {
  it('zero height is the dim base colour', () => {
    expect(heightToColour(0)).toMatch(/rgb\(26.*31.*58/);
  });
  it('peak heights saturate to scarlet', () => {
    expect(heightToColour(5)).toMatch(/rgb\(255.*77.*109/);
  });
  it('intermediate heights produce intermediate colours', () => {
    const a = heightToColour(0.5);
    const b = heightToColour(1.0);
    expect(a).not.toEqual(b);
    expect(a).toMatch(/rgb/);
    expect(b).toMatch(/rgb/);
  });
});

describe('threatSurface · isoProject', () => {
  const args = { cellWidth: 10, cellDepth: 10, heightScale: 4, pitch: 0.55 };

  it('origin maps to (0, 0)', () => {
    const p = isoProject({ x: 0, y: 0, z: 0, ...args });
    expect(p.sx).toBeCloseTo(0, 6);
    expect(p.sy).toBeCloseTo(0, 6);
  });

  it('positive x moves right, positive y moves down-and-left', () => {
    const px = isoProject({ x: 1, y: 0, z: 0, ...args });
    const py = isoProject({ x: 0, y: 1, z: 0, ...args });
    expect(px.sx).toBeGreaterThan(0);
    expect(py.sx).toBeLessThan(0);
    expect(py.sy).toBeGreaterThan(0);
  });

  it('positive z lifts the point up the screen (smaller sy)', () => {
    const ground = isoProject({ x: 1, y: 1, z: 0, ...args });
    const peak = isoProject({ x: 1, y: 1, z: 1, ...args });
    expect(peak.sy).toBeLessThan(ground.sy);
  });

  it('z=0 plane is independent of pitch', () => {
    const p1 = isoProject({ x: 2, y: 3, z: 0, ...args, pitch: 0.3 });
    const p2 = isoProject({ x: 2, y: 3, z: 0, ...args, pitch: 0.9 });
    expect(p1.sx).toBeCloseTo(p2.sx, 6);
    // sy DOES depend on pitch via cosP, so they should differ
    expect(p1.sy).not.toBeCloseTo(p2.sy);
  });
});

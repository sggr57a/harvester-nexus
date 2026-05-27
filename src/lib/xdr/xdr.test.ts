/**
 * Full-coverage XDR suite.
 *
 * Verifies:
 *   - Every detection rule fires on the expected event shape
 *   - Indicator matching across all IOC kinds (ip / domain / hash / cve / process / file-path)
 *   - Every response-action generator emits a non-empty manifest of the expected kind
 *   - The end-to-end MITRE ATT&CK kill-chain simulator triggers all 7 phases
 *   - The snapshot's killChainCounts populate every triggered tactic
 *   - The XDR stats roll up (alertsPerMin, blocked24h, escalated24h, isolatedHosts, …)
 */

import { describe, expect, it } from 'vitest';
import { XdrEngine, defaultEngine, sampleEndpointInventory } from './engine';
import { INDICATORS, INTEL_FEEDS, indexIndicators, lookupIndicator } from './intel';
import { RULES, getRule, sensorsReferenced } from './rules';
import {
  buildAlertOnly,
  buildBlockEgressDomain,
  buildBlockImage,
  buildIsolateEndpoint,
  buildKillProcess,
  buildQuarantineHost,
  buildResponseForAlert,
  buildRollbackDeployment,
  buildSnapshotLxc,
  buildSnapshotVm,
} from './responses';
import { SENSORS, getSensor, sensorsForEndpointKind, sensorsForProfile } from './sensors';
import { fullKillChain, quickSim, runFullKillChain } from './simulator';
import type { Alert, AttackTactic, SensorEvent } from './types';

/* ============================================================
   Sensor catalog
   ============================================================ */
describe('XDR · sensor catalog', () => {
  it('declares every sensor with a homepage + license + image', () => {
    expect(SENSORS.length).toBeGreaterThanOrEqual(15);
    for (const s of SENSORS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.license).toBeTruthy();
      expect(s.homepage).toMatch(/^https?:\/\//);
      expect(s.image).toBeTruthy();
      expect(s.version).toBeTruthy();
    }
  });

  it('covers every endpoint kind with at least one sensor', () => {
    const kinds: import('./types').EndpointKind[] = ['host', 'vm', 'lxc', 'pod', 'docker', 'edge'];
    for (const kind of kinds) {
      const ss = sensorsForEndpointKind(kind);
      expect(ss.length).toBeGreaterThan(0);
    }
  });

  it('baseline / hardened / maximum security profiles each grow monotonically', () => {
    const baseline = sensorsForProfile('baseline');
    const hardened = sensorsForProfile('hardened');
    const maximum = sensorsForProfile('maximum');
    expect(baseline.length).toBeLessThan(hardened.length);
    expect(hardened.length).toBeLessThan(maximum.length);
    expect(maximum.length).toBe(SENSORS.length);
    // every baseline sensor is in hardened, every hardened sensor is in maximum
    for (const id of baseline) expect(hardened).toContain(id);
    for (const id of hardened) expect(maximum).toContain(id);
  });

  it('every rule\'s `requires` is a real sensor id', () => {
    const ids = new Set(SENSORS.map((s) => s.id));
    for (const id of sensorsReferenced()) expect(ids.has(id as never)).toBe(true);
  });

  it('all sensors are free / open-source — no paid SKUs', () => {
    const paidFlags = ['proprietary', 'closed', 'paid', 'commercial', 'enterprise-only'];
    for (const s of SENSORS) {
      for (const flag of paidFlags) expect(s.license.toLowerCase()).not.toContain(flag);
    }
  });
});

/* ============================================================
   Intel feeds + indicator lookup
   ============================================================ */
describe('XDR · intel catalog', () => {
  it('declares every feed with a homepage + license + refresh interval', () => {
    expect(INTEL_FEEDS.length).toBeGreaterThanOrEqual(8);
    for (const f of INTEL_FEEDS) {
      expect(f.id).toBeTruthy();
      expect(f.license).toBeTruthy();
      expect(f.refreshIntervalSeconds).toBeGreaterThan(0);
    }
  });

  it('indexIndicators + lookupIndicator round-trip', () => {
    const idx = indexIndicators(INDICATORS);
    expect(lookupIndicator(idx, 'ip', '203.0.113.61')?.actor).toContain('APT28');
    expect(lookupIndicator(idx, 'domain', 'evil-c2.tk')).toBeTruthy();
    expect(lookupIndicator(idx, 'cve', 'CVE-2024-3094')).toBeTruthy();
    expect(lookupIndicator(idx, 'ip', '9.9.9.9')).toBeUndefined();
  });

  it('only references free / open-source feed licenses', () => {
    for (const f of INTEL_FEEDS) {
      expect(f.license.toLowerCase()).not.toContain('proprietary');
      expect(f.license.toLowerCase()).not.toContain('subscription');
    }
  });
});

/* ============================================================
   Rule engine — every rule fires on its expected event shape
   ============================================================ */
describe('XDR · rule engine — every rule fires on a tailored event', () => {
  const cases: { rule: string; event: Omit<SensorEvent, 'id' | 'timestampMs'> }[] = [
    {
      rule: 'NXR-0001-port-scan',
      event: { source: 'suricata', endpointId: 'edge-a', kind: 'ids-signature', remoteIp: '203.0.113.61', payload: { signature: 'ET SCAN port scan' } },
    },
    {
      rule: 'NXR-0002-honeypot-touch',
      event: { source: 'opencanary', endpointId: 'edge-a', kind: 'honeypot-touch', payload: { service: 'ssh' } },
    },
    {
      rule: 'NXR-0010-image-cve-blocked',
      event: { source: 'trivy', endpointId: 'pod-1', kind: 'cve-detected', payload: { severity: 'critical', cve: 'CVE-2024-3094' } },
    },
    {
      rule: 'NXR-0011-exploit-attempt',
      event: { source: 'suricata', endpointId: 'edge-a', kind: 'ids-signature', payload: { cve: 'CVE-2024-3094' } },
    },
    {
      rule: 'NXR-0020-suspicious-process',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'process-exec', process: 'nmap', payload: {} },
    },
    {
      rule: 'NXR-0021-payload-dropped',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'file-write', payload: { path: '/tmp/.x/payload' } },
    },
    {
      rule: 'NXR-0030-cron-modified',
      event: { source: 'wazuh-agent', endpointId: 'payments-vm-01', kind: 'file-write', payload: { path: '/etc/cron.d/.b3' } },
    },
    {
      rule: 'NXR-0031-priv-escalation',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'syscall', payload: { syscall: 'setuid' } },
    },
    {
      rule: 'NXR-0040-log-tamper',
      event: { source: 'wazuh-agent', endpointId: 'payments-vm-01', kind: 'file-write', payload: { path: '/var/log/syslog', op: 'delete' } },
    },
    {
      rule: 'NXR-0041-creds-dumped',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'file-open', payload: { path: '/etc/shadow', euid: 1000 } },
    },
    {
      rule: 'NXR-0050-east-west-anomaly',
      event: { source: 'hubble', endpointId: 'api-green-7c8', kind: 'network-connect', payload: { verdict: 'DROPPED' } },
    },
    {
      rule: 'NXR-0060-c2-ip',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'network-connect', remoteIp: '198.51.100.7', payload: {} },
    },
    {
      rule: 'NXR-0061-c2-domain',
      event: { source: 'hubble', endpointId: 'fraud-lxc-01', kind: 'dns-query', remoteHost: 'evil-c2.tk', payload: {} },
    },
    {
      rule: 'NXR-0062-known-bad-hash',
      event: { source: 'tetragon', endpointId: 'fraud-lxc-01', kind: 'process-exec', hash: 'a4b3c2d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', payload: {} },
    },
    {
      rule: 'NXR-0070-large-egress',
      event: { source: 'hubble', endpointId: 'payments-vm-01', kind: 'network-connect', payload: { bytes: 262_144_000 } },
    },
    {
      rule: 'NXR-0080-ransomware-pattern',
      event: { source: 'falco', endpointId: 'payments-vm-01', kind: 'file-write', payload: { ransomwarePattern: true } },
    },
  ];

  for (const c of cases) {
    it(`rule ${c.rule} fires on tailored event`, () => {
      const engine = new XdrEngine({ autoDispatch: false });
      const alerts = engine.ingest({ id: 'e1', timestampMs: Date.now(), ...c.event });
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.ruleId === c.rule)).toBe(true);
    });
  }

  it('does not fire any rule on a benign process-exec', () => {
    const engine = new XdrEngine({ autoDispatch: false });
    const alerts = engine.ingest({
      id: 'benign-1',
      timestampMs: Date.now(),
      source: 'falco',
      endpointId: 'compute-01',
      kind: 'process-exec',
      process: '/usr/bin/curl',
      payload: { args: ['--version'] },
    });
    expect(alerts).toEqual([]);
  });

  it('every rule is reachable by id and has tactics + techniques + recommended actions', () => {
    for (const rule of RULES) {
      expect(getRule(rule.id)).toBeTruthy();
      expect(rule.tactics.length).toBeGreaterThan(0);
      expect(rule.techniques.length).toBeGreaterThan(0);
      expect(rule.recommendedActions.length).toBeGreaterThan(0);
      expect(rule.requires.length).toBeGreaterThan(0);
    }
  });
});

/* ============================================================
   Response action generators — every kind emits a coherent manifest
   ============================================================ */
describe('XDR · response actions', () => {
  const sampleAlert = (): Alert => ({
    id: 'a1',
    ruleId: 'NXR-0060-c2-ip',
    ruleTitle: 'C2',
    endpointId: 'payments-vm-01',
    severity: 'critical',
    tactics: ['command-and-control'],
    techniques: ['T1071.001'],
    triggeringEvent: {
      id: 'e1',
      source: 'falco',
      endpointId: 'payments-vm-01',
      kind: 'network-connect',
      timestampMs: Date.now(),
      remoteIp: '198.51.100.7',
      remoteHost: 'evil-c2.tk',
      process: '/bin/payload',
      payload: { image: 'evil/registry:latest' },
    },
    matchedIndicators: [],
    recommendedActions: ['isolate-endpoint'],
    responseStatus: 'pending',
    timestampMs: Date.now(),
  });

  it('every generator emits a non-empty manifest', () => {
    const alert = sampleAlert();
    const actions = [
      buildAlertOnly(alert),
      buildIsolateEndpoint(alert),
      buildQuarantineHost(alert),
      buildSnapshotVm(alert),
      buildSnapshotLxc(alert),
      buildKillProcess(alert),
      buildRollbackDeployment(alert, 'demo-app', 'rev-42'),
      buildBlockImage(alert, 'evil/registry:latest'),
      buildBlockEgressDomain(alert, 'evil-c2.tk'),
    ];
    for (const a of actions) {
      expect(a.id.length).toBeGreaterThan(0);
      expect(a.manifest.length).toBeGreaterThan(20);
      expect(a.summary.length).toBeGreaterThan(0);
    }
  });

  it('CiliumNetworkPolicy isolate-endpoint manifest references the endpoint pod name', () => {
    const alert = sampleAlert();
    const action = buildIsolateEndpoint(alert);
    expect(action.kind).toBe('isolate-endpoint');
    expect(action.manifest).toContain('CiliumNetworkPolicy');
    expect(action.manifest).toContain('payments-vm-01');
    expect(action.manifest).toContain('ingress: []');
    expect(action.manifest).toContain('egress: []');
  });

  it('buildResponseForAlert dispatches to the right kind', () => {
    const alert = sampleAlert();
    const kinds: import('./types').ResponseActionKind[] = [
      'alert-only', 'isolate-endpoint', 'quarantine-host', 'snapshot-vm', 'snapshot-lxc',
      'kill-process', 'rollback-deployment', 'rotate-token', 'block-image', 'block-egress-domain',
    ];
    for (const k of kinds) {
      const action = buildResponseForAlert(alert, k);
      expect(action.kind).toBe(k);
    }
  });
});

/* ============================================================
   End-to-end attack-scenario simulator
   ============================================================ */
describe('XDR · simulator · full MITRE ATT&CK kill chain', () => {
  it('every step in the simulator fires at least one alert', () => {
    const engine = new XdrEngine({ autoDispatch: false });
    for (const ep of sampleEndpointInventory()) engine.registerEndpoint(ep);
    const steps = fullKillChain();
    for (const step of steps) {
      const fired = engine.ingest(step.event);
      expect(fired.length, `${step.label} did not fire`).toBeGreaterThan(0);
    }
  });

  it('quickSim populates the kill-chain heatmap with every phase touched', () => {
    const run = quickSim();
    expect(run.alerts.length).toBeGreaterThan(10);
    const touched: AttackTactic[] = (
      ['reconnaissance', 'initial-access', 'execution', 'persistence', 'privilege-escalation', 'defense-evasion', 'credential-access', 'lateral-movement', 'command-and-control', 'exfiltration', 'impact'] as AttackTactic[]
    );
    for (const t of touched) expect(run.snapshot.killChainCounts[t]).toBeGreaterThan(0);
  });

  it('quickSim attributes the LAZARUS + APT28 actors via the indicator catalog', () => {
    const run = quickSim();
    const actors = new Set(run.snapshot.activeThreats.map((a) => a.actor));
    expect(actors.has('LAZARUS')).toBe(true);
    expect(actors.has('APT28 / Fancy Bear')).toBe(true);
  });

  it('auto-dispatch produces at least one isolate-endpoint or kill-process response', () => {
    const engine = defaultEngine();
    runFullKillChain(engine);
    const snap = engine.snapshot();
    const kinds = new Set(snap.responses.map((r) => r.kind));
    expect(kinds.has('isolate-endpoint') || kinds.has('kill-process')).toBe(true);
  });

  it('XDR stats roll up after the simulator runs', () => {
    const engine = defaultEngine();
    runFullKillChain(engine);
    const snap = engine.snapshot();
    expect(snap.stats.alertsPerMin).toBeGreaterThan(0);
    expect(snap.stats.activeAptCount).toBeGreaterThan(0);
    expect(snap.stats.criticalCveCount).toBeGreaterThan(0);
    expect(snap.stats.sensorsTotal).toBeGreaterThan(0);
  });
});

/* ============================================================
   Inventory + scan + compliance recording
   ============================================================ */
describe('XDR · inventory + vuln + compliance', () => {
  it('registers endpoints and records vuln + compliance summaries', () => {
    const engine = new XdrEngine();
    for (const ep of sampleEndpointInventory()) engine.registerEndpoint(ep);
    engine.recordVulnSummary('payments-vm-01', {
      scannedAtMs: Date.now(),
      scanner: 'trivy',
      critical: 2, high: 7, medium: 18, low: 32,
      topCves: ['CVE-2024-3094', 'CVE-2024-21338'],
    });
    engine.recordCompliance({
      framework: 'cis-k8s',
      controlsTotal: 100,
      controlsCovered: 84,
      hardeningScore: 84,
      scannedAtMs: Date.now(),
      scanner: 'kube-bench',
    });
    const snap = engine.snapshot();
    expect(snap.vulnSummaryByEndpoint['payments-vm-01'].topCves).toContain('CVE-2024-3094');
    expect(snap.compliance.some((c) => c.framework === 'cis-k8s')).toBe(true);
    expect(snap.endpoints.length).toBeGreaterThanOrEqual(8);
  });

  it('getSensor returns by id and undefined for unknown', () => {
    expect(getSensor('falco')?.name).toBe('Falco');
    expect(getSensor('made-up' as never)).toBeUndefined();
  });
});

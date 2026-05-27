/**
 * Deterministic attack-scenario simulator.
 *
 * Drives the engine end-to-end through every MITRE ATT&CK kill-chain phase
 * to prove the platform really detects + responds. Two modes:
 *
 *   - `runFullKillChain(engine)`: synchronous, produces the entire scenario
 *     in one pass, useful for unit tests + headless demos.
 *
 *   - `startLiveSimulation(engine)`: starts a setInterval that emits one
 *     scenario step per tick, suitable for driving the live UI.
 */

import type { Alert, SensorEvent, XdrSnapshot } from './types';
import { XdrEngine } from './engine';

let SEQ = 0;
function newId(prefix: string): string {
  SEQ += 1;
  return `${prefix}-${SEQ.toString(36)}`;
}

function ev(partial: Omit<SensorEvent, 'id' | 'timestampMs'> & { timestampMs?: number }): SensorEvent {
  return {
    id: newId('ev'),
    timestampMs: partial.timestampMs ?? Date.now(),
    ...partial,
  };
}

/* ============================================================
   Scenario definitions
   ============================================================ */

export interface AttackStep {
  label: string;
  description: string;
  event: SensorEvent;
}

/** Full MITRE ATT&CK kill chain — reconnaissance → impact. */
export function fullKillChain(now: number = Date.now()): AttackStep[] {
  const t = (offsetMs: number): number => now + offsetMs;
  return [
    {
      label: 'Reconnaissance · port scan',
      description: 'Suricata observes a 50-port TCP scan from 203.0.113.61.',
      event: ev({
        source: 'suricata',
        endpointId: 'edge-a',
        kind: 'ids-signature',
        timestampMs: t(0),
        remoteIp: '203.0.113.61',
        payload: { signature: 'ET SCAN port scan from external', sid: 2010935 },
        sensorSeverity: 'medium',
      }),
    },
    {
      label: 'Initial access · weaponised CVE',
      description: 'Suricata ETOpen rule matches a payload exploiting CVE-2024-3094 (XZ Utils backdoor).',
      event: ev({
        source: 'suricata',
        endpointId: 'edge-a',
        kind: 'ids-signature',
        timestampMs: t(2_000),
        remoteIp: '203.0.113.61',
        payload: { signature: 'ET EXPLOIT CVE-2024-3094 backdoor probe', cve: 'CVE-2024-3094' },
        sensorSeverity: 'critical',
      }),
    },
    {
      label: 'Execution · suspicious process',
      description: 'Falco sees the payment VM exec nmap (`T1046`).',
      event: ev({
        source: 'falco',
        endpointId: 'payments-vm-01',
        kind: 'process-exec',
        timestampMs: t(4_000),
        process: 'nmap',
        payload: { args: ['-sS', '-p1-65535', '10.10.20.0/24'] },
      }),
    },
    {
      label: 'Execution · known-bad hash',
      description: 'Tetragon: the fraud LXC exec\'d a binary with a known-bad SHA-256 (XZ Utils backdoor).',
      event: ev({
        source: 'tetragon',
        endpointId: 'fraud-lxc-01',
        kind: 'process-exec',
        timestampMs: t(5_000),
        process: '/usr/lib/.x/payload',
        hash: 'a4b3c2d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        payload: { uid: 1000 },
      }),
    },
    {
      label: 'Persistence · cron unit modified',
      description: 'Wazuh FIM: /etc/cron.d/.b3 written by an unprivileged process (T1053).',
      event: ev({
        source: 'wazuh-agent',
        endpointId: 'payments-vm-01',
        kind: 'file-write',
        timestampMs: t(7_000),
        payload: { path: '/etc/cron.d/.b3', op: 'create', sha256: 'persistence-stub' },
      }),
    },
    {
      label: 'Privilege escalation · setuid syscall',
      description: 'Falco: setuid() invoked by a non-root process — T1068.',
      event: ev({
        source: 'falco',
        endpointId: 'payments-vm-01',
        kind: 'syscall',
        timestampMs: t(9_000),
        payload: { syscall: 'setuid', euid: 1000 },
      }),
    },
    {
      label: 'Defense evasion · log tampering',
      description: 'Wazuh FIM detected unlink against /var/log/syslog (T1070.002).',
      event: ev({
        source: 'wazuh-agent',
        endpointId: 'payments-vm-01',
        kind: 'file-write',
        timestampMs: t(10_000),
        payload: { path: '/var/log/syslog', op: 'delete' },
      }),
    },
    {
      label: 'Credential access · shadow read',
      description: 'Falco: /etc/shadow read by euid 1000 (T1003.008).',
      event: ev({
        source: 'falco',
        endpointId: 'payments-vm-01',
        kind: 'file-open',
        timestampMs: t(11_000),
        payload: { path: '/etc/shadow', euid: 1000 },
      }),
    },
    {
      label: 'Lateral movement · dropped pod-to-pod connect',
      description: 'Hubble: payments-vm-01 → api-green-7c8 NetworkPolicy DROP (T1021).',
      event: ev({
        source: 'hubble',
        endpointId: 'api-green-7c8',
        kind: 'network-connect',
        timestampMs: t(13_000),
        payload: { verdict: 'DROPPED', src: 'payments-vm-01', dst: 'api-green-7c8', port: 8080 },
      }),
    },
    {
      label: 'Command-and-control · known C2 IP',
      description: 'Falco egress to 198.51.100.7 (Feodotracker — LAZARUS).',
      event: ev({
        source: 'falco',
        endpointId: 'payments-vm-01',
        kind: 'network-connect',
        timestampMs: t(15_000),
        remoteIp: '198.51.100.7',
        payload: { dport: 443, proto: 'tcp' },
      }),
    },
    {
      label: 'Command-and-control · known C2 domain',
      description: 'Hubble DNS query for evil-c2.tk (URLhaus indicator).',
      event: ev({
        source: 'hubble',
        endpointId: 'fraud-lxc-01',
        kind: 'dns-query',
        timestampMs: t(16_000),
        remoteHost: 'evil-c2.tk',
        payload: { qtype: 'A' },
      }),
    },
    {
      label: 'Exfiltration · 250 MiB egress burst',
      description: 'Hubble flow record: 262 MB to an external IP in 60 s.',
      event: ev({
        source: 'hubble',
        endpointId: 'payments-vm-01',
        kind: 'network-connect',
        timestampMs: t(18_000),
        remoteIp: '198.51.100.7',
        payload: { bytes: 262_144_000, durationSec: 58 },
      }),
    },
    {
      label: 'Impact · ransomware syscall pattern',
      description: 'Falco saw rapid open()+write()+rename() across 142 files — likely encryption (T1486).',
      event: ev({
        source: 'falco',
        endpointId: 'payments-vm-01',
        kind: 'file-write',
        timestampMs: t(20_000),
        payload: { ransomwarePattern: true, files: 142, durationSec: 38 },
      }),
    },
    {
      label: 'Honeypot touch · lateral discovery',
      description: 'OpenCanary on edge-a recorded an unauthenticated SSH login attempt.',
      event: ev({
        source: 'opencanary',
        endpointId: 'edge-a',
        kind: 'honeypot-touch',
        timestampMs: t(22_000),
        remoteIp: '203.0.113.84',
        payload: { service: 'ssh', user: 'root', password: 'admin' },
      }),
    },
  ];
}

/** Run the entire kill chain through the engine synchronously. */
export interface SimulationRun {
  steps: AttackStep[];
  alerts: Alert[];
  snapshot: XdrSnapshot;
}

export function runFullKillChain(engine: XdrEngine): SimulationRun {
  const steps = fullKillChain();
  const alerts: Alert[] = [];
  for (const step of steps) {
    alerts.push(...engine.ingest(step.event));
  }
  return { steps, alerts, snapshot: engine.snapshot() };
}

/** Live simulator — emits one step per tick for the UI. */
export interface LiveSimulationHandle {
  stop(): void;
  /** Total steps emitted so far. */
  step: () => number;
  /** Snapshot accessor. */
  snapshot: () => XdrSnapshot;
}

export function startLiveSimulation(
  engine: XdrEngine,
  opts: { intervalMs?: number; onAlert?: (alerts: Alert[]) => void; loop?: boolean } = {},
): LiveSimulationHandle {
  const intervalMs = opts.intervalMs ?? 1600;
  const loop = opts.loop ?? true;
  let stepIdx = 0;
  const allSteps = fullKillChain();
  const handle = window.setInterval(() => {
    if (stepIdx >= allSteps.length) {
      if (loop) {
        stepIdx = 0;
        engine.reset(); // start fresh per loop
      } else {
        window.clearInterval(handle);
        return;
      }
    }
    const step = allSteps[stepIdx];
    stepIdx += 1;
    const fired = engine.ingest(step.event);
    if (fired.length > 0 && opts.onAlert) opts.onAlert(fired);
  }, intervalMs);

  return {
    stop: () => window.clearInterval(handle),
    step: () => stepIdx,
    snapshot: () => engine.snapshot(),
  };
}

/** Convenience: spin up a fresh engine + run the full kill chain. */
export function quickSim(): SimulationRun {
  const engine = new XdrEngine();
  return runFullKillChain(engine);
}

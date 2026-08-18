/**
 * React hook layer for the XDR engine.
 *
 * Demo mode registers the synthetic fintech fleet and runs the attack simulator.
 * Live mode uses real cluster inventory and ingests sensor events from the
 * cockpit BFF (Falco / Tetragon / Suricata / Wazuh, plus Kubernetes warnings).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { XdrEngine, sampleEndpointInventory } from './engine';
import { startLiveSimulation } from './simulator';
import type { Endpoint, SensorEvent, XdrSnapshot } from './types';

export interface LiveXdrOptions {
  intervalMs?: number;
  /** When true, attack simulator runs; otherwise the engine sits idle. */
  simulate?: boolean;
  /** Whether to loop the simulator forever (default) or run it once. */
  loop?: boolean;
  /** External events to ingest (e.g. from cluster BFF). Re-ingested when reference changes. */
  ingestEvents?: SensorEvent[];
  /** Endpoints to register (live fleet). Ignored when useDemoInventory is true. */
  seedEndpoints?: Endpoint[];
  /** Register sampleEndpointInventory (payments-vm, fraud-lxc, edge-a, …). Demo only. */
  useDemoInventory?: boolean;
}

function seedEngine(engine: XdrEngine, useDemoInventory: boolean, seedEndpoints?: Endpoint[]) {
  engine.reset();
  if (useDemoInventory) {
    for (const ep of sampleEndpointInventory()) engine.registerEndpoint(ep);
    return;
  }
  for (const ep of seedEndpoints ?? []) engine.registerEndpoint(ep);
}

export function useLiveXdrEngine({
  intervalMs = 1600,
  simulate = true,
  loop = true,
  ingestEvents,
  seedEndpoints,
  useDemoInventory = false,
}: LiveXdrOptions = {}): XdrSnapshot {
  const engineRef = useRef<XdrEngine | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<XdrSnapshot>(() => {
    const engine = new XdrEngine();
    seedEngine(engine, useDemoInventory, seedEndpoints);
    engineRef.current = engine;
    return engine.snapshot();
  });

  useEffect(() => {
    if (!engineRef.current) return;
    seedEngine(engineRef.current, useDemoInventory, seedEndpoints);
    seenIdsRef.current.clear();
    setSnapshot(engineRef.current.snapshot());
  }, [useDemoInventory, seedEndpoints]);

  useEffect(() => {
    if (!engineRef.current || typeof window === 'undefined') return undefined;
    const engine = engineRef.current;
    const tick = () => setSnapshot(engine.snapshot());
    const refreshHandle = window.setInterval(tick, intervalMs);
    if (!simulate) {
      return () => window.clearInterval(refreshHandle);
    }
    const sim = startLiveSimulation(engine, { intervalMs, onAlert: () => tick(), loop });
    return () => {
      sim.stop();
      window.clearInterval(refreshHandle);
    };
  }, [intervalMs, simulate, loop]);

  useEffect(() => {
    if (!engineRef.current || !ingestEvents?.length) return;
    const fresh = ingestEvents.filter((event) => !seenIdsRef.current.has(event.id));
    for (const event of fresh) seenIdsRef.current.add(event.id);
    if (!fresh.length) return;
    engineRef.current.ingestMany(fresh);
    setSnapshot(engineRef.current.snapshot());
  }, [ingestEvents]);

  return snapshot;
}

/** Convert an XdrSnapshot's `activeThreats` array into the shape the
 * existing `ThreatIntelMap` widget consumes (which has slightly different
 * action / severity enums). */
export function snapshotToThreatActors(snap: XdrSnapshot): Array<{
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  actor: string;
  cve: string;
  malware: string;
  tactic: 'recon' | 'initial-access' | 'execution' | 'persistence' | 'lateral' | 'exfil' | 'c2';
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'blocked' | 'isolated' | 'escalated' | 'observing' | 'auto-rolled-back';
  ip: string;
  iocCount: number;
}> {
  return snap.activeThreats.map((t) => ({
    id: t.id,
    city: t.city,
    country: t.country,
    lat: t.lat,
    lng: t.lng,
    actor: t.actor,
    cve: t.cve,
    malware: t.malware,
    tactic: tacticToShort(t.tactic),
    severity: severityToWidget(t.severity),
    action: actionToWidget(t.action),
    ip: t.ip,
    iocCount: t.iocCount,
  }));
}

function tacticToShort(t: import('./types').AttackTactic): 'recon' | 'initial-access' | 'execution' | 'persistence' | 'lateral' | 'exfil' | 'c2' {
  switch (t) {
    case 'reconnaissance':
    case 'discovery':
      return 'recon';
    case 'initial-access':
    case 'resource-development':
      return 'initial-access';
    case 'execution':
      return 'execution';
    case 'persistence':
    case 'privilege-escalation':
      return 'persistence';
    case 'lateral-movement':
      return 'lateral';
    case 'exfiltration':
    case 'collection':
    case 'impact':
      return 'exfil';
    case 'command-and-control':
    case 'defense-evasion':
    case 'credential-access':
    default:
      return 'c2';
  }
}

function severityToWidget(s: import('./types').Severity): 'low' | 'medium' | 'high' | 'critical' {
  if (s === 'info') return 'low';
  return s;
}

function actionToWidget(a: import('./types').ResponseActionKind): 'blocked' | 'isolated' | 'escalated' | 'observing' | 'auto-rolled-back' {
  switch (a) {
    case 'isolate-endpoint':
    case 'quarantine-host':
      return 'isolated';
    case 'block-image':
    case 'block-egress-domain':
    case 'kill-process':
      return 'blocked';
    case 'rollback-deployment':
      return 'auto-rolled-back';
    case 'snapshot-vm':
    case 'snapshot-lxc':
    case 'rotate-token':
      return 'escalated';
    case 'alert-only':
    default:
      return 'observing';
  }
}

/** Memoized snapshot → widget adapter so component re-renders are cheap. */
export function useThreatActorView(snap: XdrSnapshot) {
  return useMemo(() => snapshotToThreatActors(snap), [snap]);
}

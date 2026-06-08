/**
 * React hook layer for the XDR engine.
 *
 * `useLiveXdrEngine` spins up an `XdrEngine`, registers the default endpoint
 * inventory, kicks off the deterministic attack-scenario simulator, and
 * re-renders subscribers whenever the engine's snapshot changes. The hook is
 * the single integration point between the engine and every React widget
 * that wants live MDR/XDR data.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { XdrEngine, sampleEndpointInventory } from './engine';
import { startLiveSimulation } from './simulator';
import type { SensorEvent, XdrSnapshot } from './types';

export interface LiveXdrOptions {
  intervalMs?: number;
  /** When true, attack simulator runs; otherwise the engine sits idle. */
  simulate?: boolean;
  /** Whether to loop the simulator forever (default) or run it once. */
  loop?: boolean;
  /** External events to ingest (e.g. from cluster BFF). Re-ingested when reference changes. */
  ingestEvents?: SensorEvent[];
}

export function useLiveXdrEngine({ intervalMs = 1600, simulate = true, loop = true, ingestEvents }: LiveXdrOptions = {}): XdrSnapshot {
  const engineRef = useRef<XdrEngine | null>(null);
  const [snapshot, setSnapshot] = useState<XdrSnapshot>(() => {
    const engine = new XdrEngine();
    for (const ep of sampleEndpointInventory()) engine.registerEndpoint(ep);
    engineRef.current = engine;
    return engine.snapshot();
  });

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
    engineRef.current.ingestMany(ingestEvents);
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

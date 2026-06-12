/**
 * Nexus XDR engine.
 *
 * The engine ingests `SensorEvent`s, applies every registered `DetectionRule`,
 * emits `Alert`s for any match, dispatches a `ResponseAction` per recommended
 * action on the rule, attributes alerts to APT actors via the live indicator
 * catalog, maintains a rolling endpoint inventory, and produces an
 * `XdrSnapshot` that drives the UI. Pure data — no IO. Tested as a black box
 * by `engine.test.ts` and stressed end-to-end by the attack simulator
 * (`simulator.ts`).
 */

import { INDICATORS, indexIndicators, lookupIndicator } from './intel';
import { buildResponseForAlert } from './responses';
import { RULES } from './rules';
import { SENSORS } from './sensors';
import type {
  ActiveThreatAttribution,
  Alert,
  AttackTactic,
  CompliancePosture,
  DetectionRule,
  Endpoint,
  Indicator,
  ResponseAction,
  ResponseActionKind,
  RuleContext,
  SensorEvent,
  SensorId,
  Severity,
  VulnSummary,
  XdrSnapshot,
} from './types';

const ZERO_KILL_CHAIN: Record<AttackTactic, number> = {
  reconnaissance: 0,
  'resource-development': 0,
  'initial-access': 0,
  execution: 0,
  persistence: 0,
  'privilege-escalation': 0,
  'defense-evasion': 0,
  'credential-access': 0,
  discovery: 0,
  'lateral-movement': 0,
  collection: 0,
  'command-and-control': 0,
  exfiltration: 0,
  impact: 0,
};

/** Geographic catalog used to attribute APT origins from a source IP. */
const COUNTRY_GEO: Record<string, { country: string; city: string; lat: number; lng: number }> = {
  '203.0.113.61': { country: 'RU', city: 'Saint Petersburg', lat: 59.9, lng: 30.3 },
  '198.51.100.7': { country: 'KP', city: 'Pyongyang', lat: 39.0, lng: 125.7 },
  '203.0.113.84': { country: 'IR', city: 'Tehran', lat: 35.7, lng: 51.4 },
  '198.51.100.42': { country: 'CN', city: 'Shanghai', lat: 31.2, lng: 121.5 },
  '203.0.113.140': { country: 'NG', city: 'Lagos', lat: 6.5, lng: 3.4 },
  '198.51.100.219': { country: 'BR', city: 'Brasília', lat: -15.8, lng: -47.9 },
  '203.0.113.22': { country: 'VN', city: 'Hanoi', lat: 21.0, lng: 105.8 },
  '198.51.100.198': { country: 'VE', city: 'Caracas', lat: 10.5, lng: -66.9 },
};

export interface XdrEngineOptions {
  rules?: DetectionRule[];
  indicators?: Indicator[];
  /** Maximum events to keep in the rolling window for stat computation. */
  windowSize?: number;
  /** Maximum alerts to retain. */
  alertCap?: number;
  /** Auto-dispatch responses for rules that recommend them. */
  autoDispatch?: boolean;
}

export class XdrEngine {
  private readonly rules: DetectionRule[];
  private readonly indicators: Indicator[];
  private readonly indicatorIdx: Map<string, Indicator[]>;
  private readonly endpoints = new Map<string, Endpoint>();
  private readonly events: SensorEvent[] = [];
  private readonly alerts: Alert[] = [];
  private readonly responses: ResponseAction[] = [];
  private readonly vulnSummaryByEndpoint = new Map<string, VulnSummary>();
  private readonly compliance: CompliancePosture[] = [];
  private readonly windowSize: number;
  private readonly alertCap: number;
  private readonly autoDispatch: boolean;
  /** Recent detection latencies for the MTTD rolling average. */
  private readonly detectionLatenciesMs: number[] = [];
  /** Recent response latencies for the MTTR rolling average. */
  private readonly responseLatenciesMs: number[] = [];

  constructor(opts: XdrEngineOptions = {}) {
    this.rules = opts.rules ?? RULES;
    this.indicators = opts.indicators ?? INDICATORS;
    this.indicatorIdx = indexIndicators(this.indicators);
    this.windowSize = opts.windowSize ?? 5000;
    this.alertCap = opts.alertCap ?? 1000;
    this.autoDispatch = opts.autoDispatch ?? true;
  }

  /** Register / refresh an endpoint inventory entry. */
  registerEndpoint(endpoint: Endpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
  }

  /** Record a per-endpoint vulnerability scan result. */
  recordVulnSummary(endpointId: string, summary: VulnSummary): void {
    this.vulnSummaryByEndpoint.set(endpointId, summary);
    const ep = this.endpoints.get(endpointId);
    if (ep) ep.vulns = summary;
  }

  /** Record a compliance posture snapshot. */
  recordCompliance(posture: CompliancePosture): void {
    this.compliance.push(posture);
  }

  /** Process one sensor event — main entry point. */
  ingest(event: SensorEvent): Alert[] {
    this.events.push(event);
    if (this.events.length > this.windowSize) this.events.shift();
    const ctx: RuleContext = { indicators: this.indicators, endpoints: this.endpoints };
    const triggered: Alert[] = [];
    for (const rule of this.rules) {
      if (!rule.listensFor.includes(event.kind) && !rule.listensFor.includes(event.kind as never)) continue;
      let matched = false;
      try {
        matched = rule.matcher(event, ctx);
      } catch {
        matched = false;
      }
      if (matched) {
        const alert = this.createAlert(rule, event);
        triggered.push(alert);
        if (this.autoDispatch) this.dispatchResponsesForAlert(alert);
      }
    }
    return triggered;
  }

  /** Bulk ingest. */
  ingestMany(events: Iterable<SensorEvent>): Alert[] {
    const out: Alert[] = [];
    for (const e of events) out.push(...this.ingest(e));
    return out;
  }

  /** Dispatch a single response action (idempotent — caller decides which kind). */
  dispatch(alert: Alert, kind: ResponseActionKind): ResponseAction {
    const action = buildResponseForAlert(alert, kind);
    action.status = 'dispatched';
    this.responses.push(action);
    this.responseLatenciesMs.push(Math.max(0, Date.now() - alert.timestampMs));
    if (this.responseLatenciesMs.length > 256) this.responseLatenciesMs.shift();
    alert.responseStatus = 'dispatched';
    return action;
  }

  /** Build the snapshot the UI subscribes to. */
  snapshot(): XdrSnapshot {
    const now = Date.now();
    const last60sMs = now - 60_000;
    const last24hMs = now - 24 * 60 * 60 * 1000;
    const alertsLast60s = this.alerts.filter((a) => a.timestampMs >= last60sMs);
    const alertsLast24h = this.alerts.filter((a) => a.timestampMs >= last24hMs);
    const responsesLast24h = this.responses.filter((r, idx) =>
      idx < this.alerts.length ? this.alerts[idx].timestampMs >= last24hMs : true,
    );
    const isolatedHosts = new Set<string>();
    for (const r of this.responses) {
      if (r.kind === 'isolate-endpoint' || r.kind === 'quarantine-host') {
        isolatedHosts.add(r.endpointId);
      }
    }
    const blockedActions = responsesLast24h.filter((r) => r.kind === 'isolate-endpoint' || r.kind === 'block-image' || r.kind === 'block-egress-domain' || r.kind === 'kill-process').length;
    const escalatedActions = responsesLast24h.filter((r) => r.requiresApproval).length;

    const killChainCounts: Record<AttackTactic, number> = { ...ZERO_KILL_CHAIN };
    for (const a of alertsLast24h) {
      for (const t of a.tactics) killChainCounts[t] = (killChainCounts[t] ?? 0) + 1;
    }
    const activeThreats = this.buildActiveThreats(alertsLast24h);

    const sensorsHealthy = this.endpoints.size > 0
      ? Array.from(this.endpoints.values()).reduce((s, e) => s + e.sensors.length, 0)
      : 0;
    const sensorsTotal = SENSORS.length * Math.max(1, this.endpoints.size);

    const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

    return {
      asOfMs: now,
      endpoints: Array.from(this.endpoints.values()),
      alerts: this.alerts.slice(-200),
      responses: this.responses.slice(-200),
      vulnSummaryByEndpoint: Object.fromEntries(this.vulnSummaryByEndpoint),
      compliance: [...this.compliance],
      stats: {
        alertsPerMin: alertsLast60s.length,
        blocked24h: blockedActions,
        escalated24h: escalatedActions,
        isolatedHosts: isolatedHosts.size,
        iocsToday: this.indicators.length,
        mttdSeconds: Math.round(avg(this.detectionLatenciesMs) / 1000),
        mttrSeconds: Math.round(avg(this.responseLatenciesMs) / 1000),
        activeAptCount: new Set(activeThreats.map((t) => t.actor)).size,
        criticalCveCount: this.indicators.filter((i) => i.kind === 'cve' && i.confidence >= 90).length,
        sensorsHealthy,
        sensorsTotal,
      },
      activeThreats,
      killChainCounts,
    };
  }

  /** Drop everything — useful for tests. */
  reset(): void {
    this.endpoints.clear();
    this.events.length = 0;
    this.alerts.length = 0;
    this.responses.length = 0;
    this.vulnSummaryByEndpoint.clear();
    this.compliance.length = 0;
    this.detectionLatenciesMs.length = 0;
    this.responseLatenciesMs.length = 0;
  }

  /* ============================================================
     Internal
     ============================================================ */

  private createAlert(rule: DetectionRule, event: SensorEvent): Alert {
    const matchedIndicators: Indicator[] = [];
    if (event.remoteIp) {
      const ind = lookupIndicator(this.indicatorIdx, 'ip', event.remoteIp);
      if (ind) matchedIndicators.push(ind);
    }
    if (event.remoteHost) {
      const ind = lookupIndicator(this.indicatorIdx, 'domain', event.remoteHost);
      if (ind) matchedIndicators.push(ind);
    }
    if (event.hash) {
      const ind =
        lookupIndicator(this.indicatorIdx, 'hash-sha256', event.hash) ||
        lookupIndicator(this.indicatorIdx, 'hash-md5', event.hash) ||
        lookupIndicator(this.indicatorIdx, 'hash-sha1', event.hash);
      if (ind) matchedIndicators.push(ind);
    }
    const severity: Severity = matchedIndicators.length > 0 && matchedIndicators.some((i) => i.confidence >= 90)
      ? this.bump(rule.severity)
      : rule.severity;
    const alert: Alert = {
      id: `${rule.id}-${event.id}`,
      ruleId: rule.id,
      ruleTitle: rule.title,
      endpointId: event.endpointId,
      severity,
      tactics: rule.tactics,
      techniques: rule.techniques,
      triggeringEvent: event,
      matchedIndicators,
      recommendedActions: rule.recommendedActions,
      responseStatus: 'pending',
      timestampMs: event.timestampMs,
    };
    this.alerts.push(alert);
    if (this.alerts.length > this.alertCap) this.alerts.shift();
    this.detectionLatenciesMs.push(Math.max(0, Date.now() - event.timestampMs));
    if (this.detectionLatenciesMs.length > 256) this.detectionLatenciesMs.shift();
    return alert;
  }

  private dispatchResponsesForAlert(alert: Alert): void {
    for (const kind of alert.recommendedActions) {
      this.dispatch(alert, kind);
    }
  }

  private bump(sev: Severity): Severity {
    if (sev === 'info') return 'low';
    if (sev === 'low') return 'medium';
    if (sev === 'medium') return 'high';
    if (sev === 'high') return 'critical';
    return 'critical';
  }

  private buildActiveThreats(alerts: Alert[]): ActiveThreatAttribution[] {
    const byActor = new Map<string, { alert: Alert; iocCount: number }>();
    for (const a of alerts) {
      for (const ind of a.matchedIndicators) {
        if (!ind.actor) continue;
        const cur = byActor.get(ind.actor);
        if (!cur || cur.alert.timestampMs < a.timestampMs) {
          byActor.set(ind.actor, { alert: a, iocCount: (cur?.iocCount ?? 0) + 1 });
        } else {
          cur.iocCount += 1;
        }
      }
    }
    const out: ActiveThreatAttribution[] = [];
    for (const [actor, { alert, iocCount }] of byActor) {
      const ip = alert.triggeringEvent.remoteIp ?? '0.0.0.0';
      const geo = COUNTRY_GEO[ip] ?? { country: '??', city: 'unknown', lat: 0, lng: 0 };
      const cve = alert.matchedIndicators.find((i) => i.kind === 'cve')?.value
        ?? this.indicators.find((i) => i.actor === actor && i.kind === 'cve')?.value
        ?? 'CVE-unknown';
      const malware = alert.matchedIndicators.find((i) => i.kind === 'hash-sha256' || i.kind === 'hash-md5')?.value
        ?? 'unknown';
      out.push({
        id: `att-${actor.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        country: geo.country,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        actor,
        cve,
        malware: malware.length > 16 ? `${malware.slice(0, 16)}…` : malware,
        tactic: alert.tactics[0] ?? 'execution',
        severity: alert.severity,
        action: alert.recommendedActions[0] ?? 'alert-only',
        ip,
        iocCount,
      });
    }
    return out;
  }
}

/** Convenience: build an engine with default rules + intel. */
export function defaultEngine(): XdrEngine {
  return new XdrEngine();
}

/** Map live fleet rows (Harvester/KubeVirt) to XDR endpoint inventory — no demo names. */
export function endpointsFromMachineFleet(
  rows: Array<{ id: string; name: string; kind: string; host: string; status?: string }>,
): Endpoint[] {
  const kindMap: Record<string, Endpoint['kind']> = {
    node: 'host',
    vm: 'vm',
    lxc: 'lxc',
    pod: 'pod',
    docker: 'docker',
  };
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: kindMap[row.kind] ?? 'host',
    host: row.host,
    ip: '—',
    sensors: [],
    status: row.status === 'running' ? 'online' : row.status === 'migrating' ? 'draining' : 'unknown',
  }));
}

/** Convenience: synthesise a baseline endpoint inventory used by demos only. */
export function sampleEndpointInventory(): Endpoint[] {
  const sensorIds: SensorId[] = ['falco', 'tetragon', 'wazuh-agent', 'hubble'];
  return [
    { id: 'cp-01', name: 'control-plane-01', kind: 'host', host: 'cp-01', ip: '10.10.10.10', sensors: sensorIds, status: 'online' },
    { id: 'compute-01', name: 'compute-01', kind: 'host', host: 'compute-01', ip: '10.10.10.21', sensors: sensorIds, status: 'online' },
    { id: 'compute-02', name: 'compute-02', kind: 'host', host: 'compute-02', ip: '10.10.10.22', sensors: sensorIds, status: 'online' },
    { id: 'edge-a', name: 'edge-a', kind: 'edge', host: 'edge-a', ip: '10.10.10.31', sensors: ['falco', 'wazuh-agent', 'opencanary'], status: 'online' },
    { id: 'payments-vm-01', name: 'payments-vm-01', kind: 'vm', host: 'compute-01', ip: '10.10.20.10', sensors: ['wazuh-agent'], status: 'online', group: 'fintech', os: 'rhel-9' },
    { id: 'fraud-lxc-01', name: 'fraud-lxc-01', kind: 'lxc', host: 'compute-02', ip: '10.10.20.20', sensors: ['wazuh-agent', 'falco'], status: 'online', group: 'fintech' },
    { id: 'registry-cache', name: 'registry-cache', kind: 'docker', host: 'edge-a', ip: '10.10.20.30', sensors: ['falco', 'tetragon'], status: 'online', group: 'edge' },
    { id: 'api-green-7c8', name: 'api-green-7c8', kind: 'pod', host: 'compute-03', ip: '10.10.30.10', sensors: ['tetragon', 'hubble'], status: 'online', group: 'fintech' },
  ];
}

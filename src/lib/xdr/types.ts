/**
 * Nexus XDR / MDR — data model.
 *
 * Every type in this file is shared between:
 *   - the detection engine (`engine.ts`)
 *   - the bundled rules (`rules.ts`)
 *   - the response-action generators (`responses.ts`)
 *   - the attack-scenario simulator (`simulator.ts`)
 *   - the React UI (`ThreatIntelMap`, endpoint inventory, etc.)
 *
 * The shape is designed so the same code path can drive either real
 * sensor input (Falco / Tetragon / Wazuh / Suricata events) or
 * synthetic simulator input — the UI never has to care which.
 */

/* ============================================================
   Endpoints (every "thing" the platform protects)
   ============================================================ */

/** The kinds of endpoint Nexus protects. */
export type EndpointKind =
  | 'host'             // Harvester bare-metal node
  | 'vm'               // KubeVirt VM
  | 'lxc'              // Incus / LXC system container
  | 'pod'              // Native Kubernetes pod
  | 'docker'           // Docker / CRI-O container outside of a pod
  | 'storage'          // Storage node (Ceph rack, NVMe-oF target, …)
  | 'edge';            // Edge gateway

export type EndpointStatus = 'online' | 'isolated' | 'quarantined' | 'draining' | 'unknown';

export interface Endpoint {
  id: string;
  name: string;
  kind: EndpointKind;
  /** Which Harvester host this endpoint resides on. For hosts it's the same as `id`. */
  host: string;
  /** Primary IP on the workload VLAN. */
  ip: string;
  /** Which sensors are currently installed and reporting on this endpoint. */
  sensors: SensorId[];
  status: EndpointStatus;
  /** Logical group (namespace, VLAN, tenant). */
  group?: string;
  /** Optional OS / kernel / image identifier (used by vuln scanners). */
  os?: string;
  /** Latest CVE scan summary, if any. */
  vulns?: VulnSummary;
  /** Timestamp of last sensor heartbeat (epoch ms). */
  lastSeenMs?: number;
}

/* ============================================================
   Sensors (the FOSS agent catalog)
   ============================================================ */

/** Stable identifier for each FOSS sensor Nexus can deploy. */
export type SensorId =
  | 'falco'
  | 'tetragon'
  | 'wazuh-agent'
  | 'wazuh-manager'
  | 'trivy'
  | 'grype'
  | 'syft'
  | 'suricata'
  | 'hubble'
  | 'opensearch'
  | 'misp'
  | 'kube-bench'
  | 'kube-hunter'
  | 'polaris'
  | 'opencanary'
  | 'openscap'
  | 'lynis';

export type SensorPlacement = 'host-daemonset' | 'in-guest' | 'cluster-singleton' | 'admission-webhook' | 'cronjob' | 'sidecar';

export interface SensorDefinition {
  id: SensorId;
  name: string;
  vendor: string;
  license: string;
  homepage: string;
  /** Image / chart reference for the open-source release. */
  image: string;
  /** Pinned version (used by the manifest generator). */
  version: string;
  /** How and where the sensor runs. */
  placement: SensorPlacement;
  /** Which endpoint kinds this sensor protects. */
  covers: EndpointKind[];
  /** Which MITRE ATT&CK tactics the sensor primarily detects. */
  tactics: AttackTactic[];
  /** Short human description. */
  summary: string;
}

/* ============================================================
   Threat intelligence
   ============================================================ */

export type IndicatorKind = 'ip' | 'domain' | 'url' | 'hash-md5' | 'hash-sha1' | 'hash-sha256' | 'cve' | 'process' | 'file-path' | 'tls-cert-sha1' | 'asn';

export type IntelFeedId =
  | 'misp'
  | 'otx-alienvault'
  | 'threatfox'
  | 'urlhaus'
  | 'feodotracker'
  | 'etopen'
  | 'mitre-attack'
  | 'nvd'
  | 'osv'
  | 'local-allowlist';

export interface IntelFeed {
  id: IntelFeedId;
  name: string;
  vendor: string;
  license: string;
  homepage: string;
  /** How often the feed refreshes (seconds). */
  refreshIntervalSeconds: number;
  /** Indicator kinds this feed publishes. */
  publishes: IndicatorKind[];
}

export interface Indicator {
  kind: IndicatorKind;
  value: string;
  /** Which feed contributed it. */
  source: IntelFeedId;
  /** Confidence 0..100. */
  confidence: number;
  /** Optional actor attribution. */
  actor?: string;
  /** Optional MITRE ATT&CK technique IDs. */
  techniques?: string[];
  /** First-seen timestamp (epoch ms). */
  firstSeenMs?: number;
}

/* ============================================================
   Events (what sensors emit)
   ============================================================ */

export type EventSource = SensorId | 'simulator' | 'kubernetes-audit' | 'auditd';

export type EventKind =
  | 'process-exec'
  | 'file-open'
  | 'file-write'
  | 'network-connect'
  | 'dns-query'
  | 'syscall'
  | 'auth'
  | 'image-pull'
  | 'kube-api'
  | 'config-change'
  | 'cve-detected'
  | 'compliance-check'
  | 'honeypot-touch'
  | 'ids-signature';

export interface SensorEvent {
  id: string;
  source: EventSource;
  endpointId: string;
  kind: EventKind;
  /** Epoch ms. */
  timestampMs: number;
  /** Free-form payload — different sensors emit different shapes. */
  payload: Record<string, string | number | boolean | string[]>;
  /** Optional IP / hostname / process name extracted by the sensor. */
  process?: string;
  remoteIp?: string;
  remoteHost?: string;
  hash?: string;
  /** Severity assigned by the sensor (NOT the engine — the engine recomputes). */
  sensorSeverity?: Severity;
}

/* ============================================================
   Detection rules + alerts
   ============================================================ */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** MITRE ATT&CK tactics — the kill chain phases the UI's bottom strip shows. */
export type AttackTactic =
  | 'reconnaissance'
  | 'resource-development'
  | 'initial-access'
  | 'execution'
  | 'persistence'
  | 'privilege-escalation'
  | 'defense-evasion'
  | 'credential-access'
  | 'discovery'
  | 'lateral-movement'
  | 'collection'
  | 'command-and-control'
  | 'exfiltration'
  | 'impact';

export interface DetectionRule {
  id: string;
  /** Sigma-style title. */
  title: string;
  description: string;
  severity: Severity;
  /** Which MITRE ATT&CK technique IDs this rule maps to (e.g. T1059.004). */
  techniques: string[];
  /** Which tactics it covers (used by the kill-chain heatmap). */
  tactics: AttackTactic[];
  /** Event kinds this rule listens for. */
  listensFor: EventKind[];
  /** Sensors required to produce the events. */
  requires: SensorId[];
  /** Recommended automatic response actions when this rule fires. */
  recommendedActions: ResponseActionKind[];
  /** Pure-function matcher — returns true if the event matches this rule. */
  matcher: (event: SensorEvent, ctx: RuleContext) => boolean;
}

export interface RuleContext {
  /** Live indicator catalog supplied by the intel layer. */
  indicators: Indicator[];
  /** Endpoint inventory at evaluation time. */
  endpoints: Map<string, Endpoint>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleTitle: string;
  endpointId: string;
  severity: Severity;
  tactics: AttackTactic[];
  techniques: string[];
  /** Original event that triggered the rule. */
  triggeringEvent: SensorEvent;
  /** Matched indicators (from intel feeds) if any. */
  matchedIndicators: Indicator[];
  /** Recommended actions copied from the rule for this alert instance. */
  recommendedActions: ResponseActionKind[];
  /** Whether the engine has already dispatched the response. */
  responseStatus: 'pending' | 'dispatched' | 'acknowledged' | 'manual';
  timestampMs: number;
}

/* ============================================================
   Response actions
   ============================================================ */

export type ResponseActionKind =
  | 'alert-only'                  // record + notify, no enforcement
  | 'isolate-endpoint'            // Cilium NetworkPolicy deny-all
  | 'quarantine-host'             // Harvester cordon + drain via live migration
  | 'snapshot-vm'                 // KubeVirt + Longhorn snapshot before quarantine
  | 'snapshot-lxc'                // Incus snapshot before quarantine
  | 'kill-process'                // Tetragon TracingPolicy `Sigkill`
  | 'rollback-deployment'         // ArgoCD rollback to last-known-good revision
  | 'rotate-token'                // Rotate the service account / cluster token
  | 'block-image'                 // Trivy admission webhook → reject
  | 'block-egress-domain';        // CoreDNS / Cilium egress policy

export interface ResponseAction {
  id: string;
  kind: ResponseActionKind;
  endpointId: string;
  /** Generated Kubernetes resource YAML (or `kubectl` command) for the action. */
  manifest: string;
  /** Human-readable summary shown in the UI. */
  summary: string;
  /** Whether the action requires manual approval before dispatch. */
  requiresApproval: boolean;
  /** Status. */
  status: 'pending' | 'dispatched' | 'failed' | 'acknowledged';
}

/* ============================================================
   Vulnerability scan output
   ============================================================ */

export interface VulnSummary {
  scannedAtMs: number;
  scanner: 'trivy' | 'grype' | 'wazuh' | 'openscap';
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** Top 5 critical CVE IDs. */
  topCves: string[];
}

/* ============================================================
   Posture / compliance snapshot
   ============================================================ */

export type ComplianceFramework = 'cis-k8s' | 'cis-docker' | 'pci-dss' | 'hipaa' | 'nist-800-53' | 'iso-27001' | 'bsi-grundschutz' | 'nis2' | 'soc2';

export interface CompliancePosture {
  framework: ComplianceFramework;
  controlsTotal: number;
  controlsCovered: number;
  hardeningScore: number; // 0..100
  scannedAtMs: number;
  scanner: 'kube-bench' | 'polaris' | 'openscap' | 'lynis' | 'wazuh';
}

/* ============================================================
   Engine snapshot — what the UI reads
   ============================================================ */

export interface XdrSnapshot {
  /** Epoch ms. */
  asOfMs: number;
  endpoints: Endpoint[];
  alerts: Alert[];
  responses: ResponseAction[];
  vulnSummaryByEndpoint: Record<string, VulnSummary>;
  compliance: CompliancePosture[];
  /** Rolling counters for the XDR stat tiles. */
  stats: {
    alertsPerMin: number;
    blocked24h: number;
    escalated24h: number;
    isolatedHosts: number;
    iocsToday: number;
    mttdSeconds: number;
    mttrSeconds: number;
    activeAptCount: number;
    criticalCveCount: number;
    sensorsHealthy: number;
    sensorsTotal: number;
  };
  /** Active threat-actor attribution surfaced by the engine. */
  activeThreats: ActiveThreatAttribution[];
  /** Count of alerts per MITRE ATT&CK tactic — drives the kill-chain strip. */
  killChainCounts: Record<AttackTactic, number>;
}

export interface ActiveThreatAttribution {
  id: string;
  /** Country code attribution from the IOC source IP. */
  country: string;
  city: string;
  lat: number;
  lng: number;
  /** APT name or generic label. */
  actor: string;
  cve: string;
  malware: string;
  tactic: AttackTactic;
  severity: Severity;
  /** Most recent response taken for this attribution. */
  action: ResponseActionKind;
  ip: string;
  iocCount: number;
}

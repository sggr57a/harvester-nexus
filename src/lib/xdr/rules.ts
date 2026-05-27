/**
 * Detection rule catalog. Sigma-style — each rule is a pure-function matcher
 * over a `SensorEvent` plus a `RuleContext` (live indicator catalog + endpoint
 * inventory). Recommended response actions are attached per-rule so the engine
 * can auto-dispatch.
 *
 * The set covers all 7 phases of the MITRE ATT&CK kill chain that the
 * Networking dashboard's bottom strip shows (reconnaissance → initial-access →
 * execution → persistence → lateral-movement → command-and-control →
 * exfiltration), plus credential-access, privilege-escalation, and impact.
 */

import { lookupIndicator, indexIndicators } from './intel';
import type { DetectionRule, RuleContext, SensorEvent } from './types';

function ipIsIndicator(event: SensorEvent, ctx: RuleContext): boolean {
  if (!event.remoteIp) return false;
  const idx = indexIndicators(ctx.indicators);
  return Boolean(lookupIndicator(idx, 'ip', event.remoteIp));
}

function domainIsIndicator(event: SensorEvent, ctx: RuleContext): boolean {
  if (!event.remoteHost) return false;
  const idx = indexIndicators(ctx.indicators);
  return Boolean(lookupIndicator(idx, 'domain', event.remoteHost));
}

function hashIsIndicator(event: SensorEvent, ctx: RuleContext): boolean {
  if (!event.hash) return false;
  const idx = indexIndicators(ctx.indicators);
  return Boolean(
    lookupIndicator(idx, 'hash-sha256', event.hash) ||
      lookupIndicator(idx, 'hash-md5', event.hash) ||
      lookupIndicator(idx, 'hash-sha1', event.hash),
  );
}

function processIsSuspicious(event: SensorEvent, ctx: RuleContext): boolean {
  if (!event.process) return false;
  const idx = indexIndicators(ctx.indicators);
  return Boolean(lookupIndicator(idx, 'process', event.process));
}

function pathIsSuspicious(event: SensorEvent, ctx: RuleContext): boolean {
  const path = (event.payload['path'] as string) || '';
  if (!path) return false;
  const idx = indexIndicators(ctx.indicators);
  return Boolean(lookupIndicator(idx, 'file-path', path));
}

export const RULES: DetectionRule[] = [
  /* ============================================================
     Reconnaissance + Discovery
     ============================================================ */
  {
    id: 'NXR-0001-port-scan',
    title: 'Port-scan pattern detected from a single source',
    description: 'More than 50 distinct destination ports hit within 60 s by one remote IP.',
    severity: 'medium',
    techniques: ['T1046'],
    tactics: ['reconnaissance', 'discovery'],
    listensFor: ['ids-signature'],
    requires: ['suricata'],
    recommendedActions: ['alert-only', 'isolate-endpoint'],
    matcher: (event) => event.source === 'suricata' && (event.payload['signature'] as string)?.toLowerCase().includes('port scan'),
  },
  {
    id: 'NXR-0002-honeypot-touch',
    title: 'Honeypot interaction',
    description: 'Any TCP / SSH / HTTP touch on an OpenCanary honeypot is high-confidence malicious.',
    severity: 'high',
    techniques: ['T1046', 'T1110'],
    tactics: ['reconnaissance', 'discovery', 'credential-access'],
    listensFor: ['honeypot-touch'],
    requires: ['opencanary'],
    recommendedActions: ['isolate-endpoint', 'alert-only'],
    matcher: (event) => event.kind === 'honeypot-touch',
  },

  /* ============================================================
     Initial access
     ============================================================ */
  {
    id: 'NXR-0010-image-cve-blocked',
    title: 'Image pull with critical CVE',
    description: 'Trivy admission webhook found a critical CVE in the image. Block the pull.',
    severity: 'high',
    techniques: ['T1190', 'T1195.002'],
    tactics: ['initial-access', 'resource-development'],
    listensFor: ['cve-detected', 'image-pull'],
    requires: ['trivy'],
    recommendedActions: ['block-image', 'alert-only'],
    matcher: (event) => event.kind === 'cve-detected' && (event.payload['severity'] as string) === 'critical',
  },
  {
    id: 'NXR-0011-exploit-attempt',
    title: 'Known weaponised CVE exploitation attempt',
    description: 'Suricata ETOpen rule flagged an exploit payload matching a known weaponised CVE.',
    severity: 'critical',
    techniques: ['T1190'],
    tactics: ['initial-access'],
    listensFor: ['ids-signature'],
    requires: ['suricata'],
    recommendedActions: ['isolate-endpoint', 'snapshot-vm'],
    matcher: (event, ctx) =>
      event.source === 'suricata' &&
      Boolean((event.payload['cve'] as string) && lookupIndicator(indexIndicators(ctx.indicators), 'cve', event.payload['cve'] as string)),
  },

  /* ============================================================
     Execution
     ============================================================ */
  {
    id: 'NXR-0020-suspicious-process',
    title: 'Suspicious process executed inside a workload',
    description: 'A process name on the threat-intel watchlist was executed (mimikatz, nmap, nc, …).',
    severity: 'high',
    techniques: ['T1059', 'T1003', 'T1046'],
    tactics: ['execution', 'credential-access', 'discovery'],
    listensFor: ['process-exec'],
    requires: ['falco', 'tetragon'],
    recommendedActions: ['kill-process', 'isolate-endpoint'],
    matcher: processIsSuspicious,
  },
  {
    id: 'NXR-0021-payload-dropped',
    title: 'Suspicious file written to a known staging path',
    description: 'File written under /tmp/.x or /dev/shm/.cache — common malware staging path.',
    severity: 'high',
    techniques: ['T1059.004'],
    tactics: ['execution', 'defense-evasion'],
    listensFor: ['file-write'],
    requires: ['falco'],
    recommendedActions: ['isolate-endpoint', 'snapshot-vm'],
    matcher: pathIsSuspicious,
  },

  /* ============================================================
     Persistence + Privilege escalation
     ============================================================ */
  {
    id: 'NXR-0030-cron-modified',
    title: 'Cron / systemd unit modified inside a VM or container',
    description: 'Wazuh FIM detected a modification of a persistence-related path (cron, systemd unit, rc.local).',
    severity: 'high',
    techniques: ['T1053', 'T1547'],
    tactics: ['persistence', 'privilege-escalation'],
    listensFor: ['file-write'],
    requires: ['wazuh-agent'],
    recommendedActions: ['snapshot-vm', 'alert-only'],
    matcher: (event) => {
      const path = (event.payload['path'] as string) || '';
      return /\/etc\/(cron|systemd\/system|init\.d|rc\.local)/.test(path);
    },
  },
  {
    id: 'NXR-0031-priv-escalation',
    title: 'Privilege-escalation syscall pattern',
    description: 'setuid() / setgid() / capset() called by an unprivileged process — Falco detection.',
    severity: 'critical',
    techniques: ['T1068', 'T1548'],
    tactics: ['privilege-escalation'],
    listensFor: ['syscall'],
    requires: ['falco'],
    recommendedActions: ['kill-process', 'isolate-endpoint'],
    matcher: (event) => event.kind === 'syscall' && /setuid|setgid|capset/.test((event.payload['syscall'] as string) || ''),
  },

  /* ============================================================
     Defense evasion + Credential access
     ============================================================ */
  {
    id: 'NXR-0040-log-tamper',
    title: 'Log tampering attempt',
    description: 'Wazuh FIM detected an `unlink` / `truncate` against /var/log/* — defense evasion.',
    severity: 'high',
    techniques: ['T1070.002'],
    tactics: ['defense-evasion'],
    listensFor: ['file-write'],
    requires: ['wazuh-agent'],
    recommendedActions: ['isolate-endpoint', 'snapshot-vm'],
    matcher: (event) => /\/var\/log\//.test((event.payload['path'] as string) || '') && (event.payload['op'] as string) === 'delete',
  },
  {
    id: 'NXR-0041-creds-dumped',
    title: 'Credential file read by non-root process',
    description: 'A process other than root or the agent read /etc/shadow or kubeconfig.',
    severity: 'critical',
    techniques: ['T1003.008', 'T1552.001'],
    tactics: ['credential-access'],
    listensFor: ['file-open'],
    requires: ['falco'],
    recommendedActions: ['kill-process', 'isolate-endpoint'],
    matcher: (event) => {
      const path = (event.payload['path'] as string) || '';
      return /\/etc\/shadow|\.kube\/config|\.aws\/credentials/.test(path) && (event.payload['euid'] as number) !== 0;
    },
  },

  /* ============================================================
     Lateral movement
     ============================================================ */
  {
    id: 'NXR-0050-east-west-anomaly',
    title: 'Anomalous east-west connection',
    description: 'Hubble flow log: pod-to-pod connection across namespaces that has no allowing NetworkPolicy.',
    severity: 'medium',
    techniques: ['T1021'],
    tactics: ['lateral-movement'],
    listensFor: ['network-connect'],
    requires: ['hubble'],
    recommendedActions: ['isolate-endpoint', 'alert-only'],
    matcher: (event) => event.source === 'hubble' && (event.payload['verdict'] as string) === 'DROPPED',
  },

  /* ============================================================
     Command and control
     ============================================================ */
  {
    id: 'NXR-0060-c2-ip',
    title: 'Outbound connection to known C2 IP',
    description: 'Egress connection from a workload to an IP listed in Feodotracker / ThreatFox / OTX.',
    severity: 'critical',
    techniques: ['T1071.001', 'T1090.003'],
    tactics: ['command-and-control'],
    listensFor: ['network-connect'],
    requires: ['falco', 'hubble', 'suricata'],
    recommendedActions: ['block-egress-domain', 'isolate-endpoint'],
    matcher: ipIsIndicator,
  },
  {
    id: 'NXR-0061-c2-domain',
    title: 'DNS query for known C2 domain',
    description: 'Cilium / CoreDNS observed a query for a domain on the threat-intel list.',
    severity: 'critical',
    techniques: ['T1071.004'],
    tactics: ['command-and-control'],
    listensFor: ['dns-query'],
    requires: ['hubble'],
    recommendedActions: ['block-egress-domain', 'isolate-endpoint'],
    matcher: domainIsIndicator,
  },
  {
    id: 'NXR-0062-known-bad-hash',
    title: 'Known-bad binary executed',
    description: 'Process exec where the binary SHA-256 is on the threat-intel hash list (MISP / OTX / ThreatFox).',
    severity: 'critical',
    techniques: ['T1059'],
    tactics: ['execution', 'command-and-control'],
    listensFor: ['process-exec'],
    requires: ['falco', 'tetragon'],
    recommendedActions: ['kill-process', 'snapshot-vm', 'isolate-endpoint'],
    matcher: hashIsIndicator,
  },

  /* ============================================================
     Exfiltration + Impact
     ============================================================ */
  {
    id: 'NXR-0070-large-egress',
    title: 'Anomalously large egress',
    description: 'Hubble flow exceeded the per-pod egress baseline by 10× in a 60 s window.',
    severity: 'high',
    techniques: ['T1041', 'T1567'],
    tactics: ['exfiltration'],
    listensFor: ['network-connect'],
    requires: ['hubble'],
    recommendedActions: ['isolate-endpoint', 'snapshot-vm'],
    matcher: (event) => event.source === 'hubble' && Number(event.payload['bytes'] || 0) > 100_000_000,
  },
  {
    id: 'NXR-0080-ransomware-pattern',
    title: 'Mass file-encrypt syscall pattern',
    description: 'Falco saw open()+write()+rename() on >100 files in <60s with extensions changing — likely ransomware.',
    severity: 'critical',
    techniques: ['T1486'],
    tactics: ['impact'],
    listensFor: ['file-write'],
    requires: ['falco'],
    recommendedActions: ['kill-process', 'snapshot-vm', 'isolate-endpoint', 'rollback-deployment'],
    matcher: (event) => Boolean(event.payload['ransomwarePattern']),
  },
];

/** Look up a rule by id. */
export function getRule(id: string): DetectionRule | undefined {
  return RULES.find((r) => r.id === id);
}

/** All sensor ids referenced by any rule. */
export function sensorsReferenced(): Set<string> {
  const s = new Set<string>();
  for (const r of RULES) for (const sensor of r.requires) s.add(sensor);
  return s;
}

/**
 * Threat-intel catalog — every feed is open / free.
 *
 * - MISP, OTX, Abuse.ch (Threatfox / URLhaus / Feodotracker), ETOpen,
 *   MITRE ATT&CK, NVD, OSV — all freely consumable.
 * - The `INDICATORS` array below is a small starter set (used by the
 *   simulator + the bundled rules) so the engine has matchable IOCs out of
 *   the box; in a deployed setup MISP would refresh this catalog from the
 *   live feeds every few minutes.
 */

import type { Indicator, IntelFeed } from './types';

export const INTEL_FEEDS: IntelFeed[] = [
  {
    id: 'misp',
    name: 'MISP',
    vendor: 'CIRCL.lu',
    license: 'AGPL',
    homepage: 'https://www.misp-project.org',
    refreshIntervalSeconds: 600,
    publishes: ['ip', 'domain', 'url', 'hash-md5', 'hash-sha1', 'hash-sha256', 'cve'],
  },
  {
    id: 'otx-alienvault',
    name: 'AlienVault OTX',
    vendor: 'AT&T Cybersecurity (community)',
    license: 'Free public feed',
    homepage: 'https://otx.alienvault.com',
    refreshIntervalSeconds: 900,
    publishes: ['ip', 'domain', 'url', 'hash-md5', 'hash-sha256'],
  },
  {
    id: 'threatfox',
    name: 'Abuse.ch · ThreatFox',
    vendor: 'abuse.ch',
    license: 'Free public feed',
    homepage: 'https://threatfox.abuse.ch',
    refreshIntervalSeconds: 300,
    publishes: ['ip', 'domain', 'url', 'hash-md5', 'hash-sha1', 'hash-sha256'],
  },
  {
    id: 'urlhaus',
    name: 'Abuse.ch · URLhaus',
    vendor: 'abuse.ch',
    license: 'Free public feed',
    homepage: 'https://urlhaus.abuse.ch',
    refreshIntervalSeconds: 300,
    publishes: ['url', 'domain', 'hash-md5', 'hash-sha256'],
  },
  {
    id: 'feodotracker',
    name: 'Abuse.ch · Feodo Tracker',
    vendor: 'abuse.ch',
    license: 'Free public feed',
    homepage: 'https://feodotracker.abuse.ch',
    refreshIntervalSeconds: 600,
    publishes: ['ip', 'tls-cert-sha1'],
  },
  {
    id: 'etopen',
    name: 'Emerging Threats Open',
    vendor: 'Proofpoint (free)',
    license: 'BSD-style',
    homepage: 'https://rules.emergingthreats.net/open',
    refreshIntervalSeconds: 86_400,
    publishes: ['ip', 'domain'],
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    vendor: 'MITRE',
    license: 'CC BY 4.0',
    homepage: 'https://attack.mitre.org',
    refreshIntervalSeconds: 604_800,
    publishes: [],
  },
  {
    id: 'nvd',
    name: 'NVD',
    vendor: 'NIST',
    license: 'Public domain',
    homepage: 'https://nvd.nist.gov',
    refreshIntervalSeconds: 21_600,
    publishes: ['cve'],
  },
  {
    id: 'osv',
    name: 'OSV.dev',
    vendor: 'Google · Open Source Security Foundation',
    license: 'Apache 2.0',
    homepage: 'https://osv.dev',
    refreshIntervalSeconds: 14_400,
    publishes: ['cve'],
  },
  {
    id: 'local-allowlist',
    name: 'Local Allowlist',
    vendor: 'Nexus',
    license: 'Internal',
    homepage: '',
    refreshIntervalSeconds: 30,
    publishes: ['ip', 'domain', 'hash-sha256'],
  },
];

/** Starter indicator catalog used by the simulator + rules. */
export const INDICATORS: Indicator[] = [
  // Known C2 IPs from Feodotracker (illustrative, in TEST-NET-3 / RFC-5737 ranges)
  { kind: 'ip', value: '203.0.113.61', source: 'feodotracker', confidence: 90, actor: 'APT28 / Fancy Bear', techniques: ['T1071.001'], firstSeenMs: 0 },
  { kind: 'ip', value: '198.51.100.7', source: 'feodotracker', confidence: 88, actor: 'LAZARUS', techniques: ['T1090.003'], firstSeenMs: 0 },
  { kind: 'ip', value: '203.0.113.84', source: 'threatfox', confidence: 78, actor: 'APT34 / OilRig', techniques: ['T1071.001'], firstSeenMs: 0 },
  { kind: 'ip', value: '198.51.100.42', source: 'threatfox', confidence: 82, actor: 'APT41 / BARIUM', techniques: ['T1041'], firstSeenMs: 0 },
  { kind: 'ip', value: '203.0.113.140', source: 'urlhaus', confidence: 70, actor: 'TA505', techniques: ['T1105'], firstSeenMs: 0 },
  { kind: 'ip', value: '198.51.100.219', source: 'otx-alienvault', confidence: 65, actor: 'Coyote', techniques: ['T1059.001'], firstSeenMs: 0 },

  // Known C2 domains
  { kind: 'domain', value: 'evil-c2.tk', source: 'urlhaus', confidence: 95, actor: 'unattributed', techniques: ['T1071.001'] },
  { kind: 'domain', value: 'payload-loader.cf', source: 'threatfox', confidence: 90, actor: 'TA505', techniques: ['T1105'] },

  // Malware hashes — placeholder XZ Utils backdoor, FudModule, Cobalt Strike beacon
  { kind: 'hash-sha256', value: 'a4b3c2d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', source: 'misp', confidence: 100, actor: 'APT28 / Fancy Bear' },
  { kind: 'hash-sha256', value: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2', source: 'misp', confidence: 100, actor: 'LAZARUS' },
  { kind: 'hash-sha256', value: 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5b6c7d8e9f0a1b2', source: 'otx-alienvault', confidence: 95, actor: 'TA505' },

  // Known weaponised CVEs
  { kind: 'cve', value: 'CVE-2024-3094', source: 'nvd', confidence: 100, actor: 'APT28 / Fancy Bear', techniques: ['T1195.002'] },
  { kind: 'cve', value: 'CVE-2024-21338', source: 'nvd', confidence: 100, actor: 'LAZARUS', techniques: ['T1547'] },
  { kind: 'cve', value: 'CVE-2023-46805', source: 'nvd', confidence: 95, actor: 'APT34 / OilRig', techniques: ['T1190'] },
  { kind: 'cve', value: 'CVE-2024-1086', source: 'nvd', confidence: 90, actor: 'APT41 / BARIUM', techniques: ['T1068'] },
  { kind: 'cve', value: 'CVE-2023-50164', source: 'nvd', confidence: 90, actor: 'TA505', techniques: ['T1190'] },
  { kind: 'cve', value: 'CVE-2024-6387', source: 'nvd', confidence: 95, actor: 'Coyote', techniques: ['T1078'] },
  { kind: 'cve', value: 'CVE-2024-30040', source: 'nvd', confidence: 88, actor: 'APT32 / OceanLotus', techniques: ['T1059.001'] },

  // Process names that should never appear inside KubeVirt VMs / LXCs
  { kind: 'process', value: 'mimikatz.exe', source: 'misp', confidence: 100, techniques: ['T1003'] },
  { kind: 'process', value: 'nmap', source: 'misp', confidence: 50, techniques: ['T1046'] },
  { kind: 'process', value: 'nc', source: 'misp', confidence: 40, techniques: ['T1059'] },

  // Suspicious file paths inside containers
  { kind: 'file-path', value: '/tmp/.x/payload', source: 'misp', confidence: 92, techniques: ['T1059.004'] },
  { kind: 'file-path', value: '/dev/shm/.cache', source: 'misp', confidence: 90, techniques: ['T1059.004'] },
];

/** Index indicators by `${kind}::${value}` for O(1) match. */
export function indexIndicators(indicators: Indicator[]): Map<string, Indicator[]> {
  const map = new Map<string, Indicator[]>();
  for (const i of indicators) {
    const key = `${i.kind}::${i.value}`;
    const arr = map.get(key) ?? [];
    arr.push(i);
    map.set(key, arr);
  }
  return map;
}

/** Look up an indicator quickly by kind + value. */
export function lookupIndicator(idx: Map<string, Indicator[]>, kind: string, value: string): Indicator | undefined {
  return idx.get(`${kind}::${value}`)?.[0];
}

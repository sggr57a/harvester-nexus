/**
 * Sensor catalog — every FOSS agent Nexus can deploy. No paid software.
 *
 * Each entry is the canonical place to look up the upstream image, license,
 * homepage, version, placement (DaemonSet / in-guest / admission webhook /
 * cronjob), the endpoint kinds the sensor protects, and the MITRE ATT&CK
 * tactics it primarily detects.
 *
 * The `endpointInventoryForSensors` helper expands a chosen sensor list into
 * the expected coverage matrix per endpoint kind, so the Setup Wizard can
 * tell the operator "you'll get host-level syscall + DNS detection on every
 * Harvester node, plus in-guest FIM on every KubeVirt VM, plus admission-time
 * CVE blocking on every image pull".
 */

import type { EndpointKind, SensorDefinition, SensorId } from './types';

export const SENSORS: SensorDefinition[] = [
  {
    id: 'falco',
    name: 'Falco',
    vendor: 'CNCF · Falco',
    license: 'Apache 2.0',
    homepage: 'https://falco.org',
    image: 'docker.io/falcosecurity/falco-no-driver:0.40.0',
    version: '0.40.0',
    placement: 'host-daemonset',
    covers: ['host', 'pod', 'docker', 'lxc'],
    tactics: ['execution', 'persistence', 'privilege-escalation', 'defense-evasion', 'credential-access', 'discovery', 'lateral-movement', 'collection'],
    summary: 'eBPF runtime security: syscall, process exec, file open, network connect on every host + container.',
  },
  {
    id: 'tetragon',
    name: 'Tetragon',
    vendor: 'CNCF · Cilium',
    license: 'Apache 2.0',
    homepage: 'https://tetragon.io',
    image: 'quay.io/cilium/tetragon:v1.5.0',
    version: '1.5.0',
    placement: 'host-daemonset',
    covers: ['host', 'pod', 'docker'],
    tactics: ['execution', 'persistence', 'privilege-escalation', 'defense-evasion', 'lateral-movement'],
    summary: 'eBPF process + network observability with inline policy enforcement (kill process, drop socket).',
  },
  {
    id: 'wazuh-agent',
    name: 'Wazuh Agent',
    vendor: 'Wazuh, Inc.',
    license: 'GPL v2',
    homepage: 'https://wazuh.com',
    image: 'docker.io/wazuh/wazuh-agent:4.10.0',
    version: '4.10.0',
    placement: 'in-guest',
    covers: ['host', 'vm', 'lxc'],
    tactics: ['persistence', 'privilege-escalation', 'defense-evasion', 'credential-access', 'discovery', 'collection', 'exfiltration', 'impact'],
    summary: 'Full HIDS inside VMs / LXCs: file-integrity monitoring, log collection, rootcheck, vuln scan, syscall monitor.',
  },
  {
    id: 'wazuh-manager',
    name: 'Wazuh Manager',
    vendor: 'Wazuh, Inc.',
    license: 'GPL v2',
    homepage: 'https://wazuh.com',
    image: 'docker.io/wazuh/wazuh-manager:4.10.0',
    version: '4.10.0',
    placement: 'cluster-singleton',
    covers: [],
    tactics: [],
    summary: 'Centralized alert correlation + decoder framework + MITRE ATT&CK mapping for the Wazuh fleet.',
  },
  {
    id: 'trivy',
    name: 'Trivy',
    vendor: 'Aqua Security',
    license: 'Apache 2.0',
    homepage: 'https://github.com/aquasecurity/trivy',
    image: 'ghcr.io/aquasecurity/trivy-operator:0.24.0',
    version: '0.24.0',
    placement: 'admission-webhook',
    covers: ['pod', 'docker'],
    tactics: ['initial-access', 'resource-development'],
    summary: 'Image + filesystem CVE scanning + secret detection + misconfig detection at admission time.',
  },
  {
    id: 'grype',
    name: 'Grype',
    vendor: 'Anchore',
    license: 'Apache 2.0',
    homepage: 'https://github.com/anchore/grype',
    image: 'docker.io/anchore/grype:0.85.0',
    version: '0.85.0',
    placement: 'cronjob',
    covers: ['pod', 'docker', 'vm'],
    tactics: ['initial-access'],
    summary: 'Second-opinion CVE scanner over installed packages and OS images.',
  },
  {
    id: 'syft',
    name: 'Syft',
    vendor: 'Anchore',
    license: 'Apache 2.0',
    homepage: 'https://github.com/anchore/syft',
    image: 'docker.io/anchore/syft:1.20.0',
    version: '1.20.0',
    placement: 'cronjob',
    covers: ['pod', 'docker', 'vm'],
    tactics: [],
    summary: 'SBOM generation (SPDX, CycloneDX) for every image and VM filesystem.',
  },
  {
    id: 'suricata',
    name: 'Suricata',
    vendor: 'OISF',
    license: 'GPL v2',
    homepage: 'https://suricata.io',
    image: 'docker.io/jasonish/suricata:7.0.7',
    version: '7.0.7',
    placement: 'host-daemonset',
    covers: ['host', 'edge'],
    tactics: ['command-and-control', 'exfiltration', 'initial-access', 'lateral-movement'],
    summary: 'Inline network IDS/IPS at the Frankfurt VIP + per-VLAN with the free Emerging Threats ETOpen ruleset.',
  },
  {
    id: 'hubble',
    name: 'Hubble',
    vendor: 'CNCF · Cilium',
    license: 'Apache 2.0',
    homepage: 'https://github.com/cilium/hubble',
    image: 'quay.io/cilium/hubble-relay:v1.16.5',
    version: '1.16.5',
    placement: 'host-daemonset',
    covers: ['host', 'pod'],
    tactics: ['discovery', 'lateral-movement', 'command-and-control'],
    summary: 'L3/L4/L7 flow logs + DNS observability from eBPF Cilium datapath.',
  },
  {
    id: 'opensearch',
    name: 'OpenSearch',
    vendor: 'OpenSearch Project',
    license: 'Apache 2.0',
    homepage: 'https://opensearch.org',
    image: 'docker.io/opensearchproject/opensearch:2.18.0',
    version: '2.18.0',
    placement: 'cluster-singleton',
    covers: [],
    tactics: [],
    summary: 'Event lake — indexes Falco / Tetragon / Suricata / Wazuh / Hubble events for SIEM queries.',
  },
  {
    id: 'misp',
    name: 'MISP',
    vendor: 'CIRCL.lu',
    license: 'AGPL',
    homepage: 'https://www.misp-project.org',
    image: 'docker.io/coolacid/misp-docker:core-latest',
    version: 'latest',
    placement: 'cluster-singleton',
    covers: [],
    tactics: [],
    summary: 'Open threat-intel platform — pulls Abuse.ch / OTX / ETOpen / community feeds, deduplicates IOCs.',
  },
  {
    id: 'kube-bench',
    name: 'kube-bench',
    vendor: 'Aqua Security',
    license: 'Apache 2.0',
    homepage: 'https://github.com/aquasecurity/kube-bench',
    image: 'docker.io/aquasec/kube-bench:v0.10.4',
    version: '0.10.4',
    placement: 'cronjob',
    covers: ['host'],
    tactics: [],
    summary: 'CIS Kubernetes Benchmark scan run nightly against the Harvester control plane + nodes.',
  },
  {
    id: 'kube-hunter',
    name: 'kube-hunter',
    vendor: 'Aqua Security',
    license: 'Apache 2.0',
    homepage: 'https://github.com/aquasecurity/kube-hunter',
    image: 'docker.io/aquasec/kube-hunter:0.6.8',
    version: '0.6.8',
    placement: 'cronjob',
    covers: ['host'],
    tactics: ['discovery'],
    summary: 'Pen-test the cluster from inside + outside; report weak configs.',
  },
  {
    id: 'polaris',
    name: 'Polaris',
    vendor: 'Fairwinds',
    license: 'Apache 2.0',
    homepage: 'https://github.com/FairwindsOps/polaris',
    image: 'quay.io/fairwinds/polaris:9.6',
    version: '9.6',
    placement: 'admission-webhook',
    covers: ['pod'],
    tactics: [],
    summary: 'Best-practice / posture checks on every workload manifest at admission time.',
  },
  {
    id: 'opencanary',
    name: 'OpenCanary',
    vendor: 'Thinkst',
    license: 'BSD',
    homepage: 'https://github.com/thinkst/opencanary',
    image: 'docker.io/thinkst/opencanary:latest',
    version: '0.9.4',
    placement: 'host-daemonset',
    covers: ['edge', 'host'],
    tactics: ['discovery', 'lateral-movement', 'credential-access'],
    summary: 'Deception honeypots placed in each VLAN — any touch is a high-confidence detection.',
  },
  {
    id: 'openscap',
    name: 'OpenSCAP',
    vendor: 'Red Hat / OpenSCAP',
    license: 'LGPL',
    homepage: 'https://github.com/OpenSCAP',
    image: 'quay.io/compliance-operator/openscap-ocp:1.3.6',
    version: '1.3.6',
    placement: 'cronjob',
    covers: ['host', 'vm'],
    tactics: [],
    summary: 'Host hardening + compliance scans against SCAP content (PCI-DSS, NIST, STIG, …).',
  },
  {
    id: 'lynis',
    name: 'Lynis',
    vendor: 'CISOfy',
    license: 'GPL v3',
    homepage: 'https://github.com/CISOfy/lynis',
    image: 'docker.io/cisofy/lynis:3.1.4',
    version: '3.1.4',
    placement: 'cronjob',
    covers: ['host', 'vm', 'lxc'],
    tactics: [],
    summary: 'Auditing tool for Unix-based systems — hardening + compliance with optional remediation.',
  },
];

/** Look up a sensor definition by id. */
export function getSensor(id: SensorId): SensorDefinition | undefined {
  return SENSORS.find((s) => s.id === id);
}

/** For each endpoint kind, which sensors cover it. */
export function sensorsForEndpointKind(kind: EndpointKind): SensorDefinition[] {
  return SENSORS.filter((s) => s.covers.includes(kind));
}

/** Sensors required by a Nexus security profile (low / medium / high). */
export type SecurityProfile = 'baseline' | 'hardened' | 'maximum';

export function sensorsForProfile(profile: SecurityProfile): SensorId[] {
  if (profile === 'baseline') {
    return ['falco', 'trivy', 'kube-bench', 'wazuh-manager', 'wazuh-agent', 'hubble'];
  }
  if (profile === 'hardened') {
    return [
      'falco', 'tetragon', 'wazuh-manager', 'wazuh-agent',
      'trivy', 'grype', 'syft', 'suricata', 'hubble',
      'opensearch', 'kube-bench', 'polaris',
    ];
  }
  // maximum — everything
  return SENSORS.map((s) => s.id);
}

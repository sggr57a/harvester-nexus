/**
 * Sensor manifest generators — every output is a real Kubernetes manifest
 * (or kubectl command) for the FOSS upstream of that sensor. No paid
 * components, no hidden services. Operators run the bundle returned by
 * `buildXdrDeploymentBundle(...)` and they have a working detect-and-respond
 * pipeline.
 *
 * The Setup Wizard's Security Posture step consumes these.
 */

import YAML from 'yaml';
import type { SecurityProfile } from './sensors';
import { SENSORS, getSensor, sensorsForProfile } from './sensors';
import type { SensorDefinition, SensorId } from './types';

const NS = 'nexus-xdr';

function ns(): string {
  return YAML.stringify({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: NS, labels: { 'pod-security.kubernetes.io/enforce': 'privileged', 'app.kubernetes.io/managed-by': 'nexus-xdr' } },
  });
}

/* ============================================================
   DaemonSets — host-resident sensors
   ============================================================ */

function daemonSet(sensor: SensorDefinition, extraSpec: Record<string, unknown> = {}): string {
  return YAML.stringify({
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: { name: sensor.id, namespace: NS, labels: { 'app.kubernetes.io/name': sensor.id, 'app.kubernetes.io/managed-by': 'nexus-xdr', 'sensor.nexus.io/license': sensor.license } },
    spec: {
      selector: { matchLabels: { 'app.kubernetes.io/name': sensor.id } },
      template: {
        metadata: { labels: { 'app.kubernetes.io/name': sensor.id, 'app.kubernetes.io/managed-by': 'nexus-xdr' } },
        spec: {
          hostNetwork: true,
          hostPID: true,
          tolerations: [{ operator: 'Exists' }],
          containers: [
            {
              name: sensor.id,
              image: sensor.image,
              imagePullPolicy: 'IfNotPresent',
              securityContext: { privileged: true },
              resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
              ...extraSpec,
            },
          ],
        },
      },
    },
  });
}

function falcoManifest(): string {
  return daemonSet(getSensor('falco')!, {
    args: ['/usr/bin/falco', '--modern-bpf', '-pk', '-o', 'json_output=true'],
    env: [
      { name: 'FALCO_BPF_PROBE', value: '' },
      { name: 'SKIP_DRIVER_LOADER', value: 'yes' },
    ],
    volumeMounts: [
      { name: 'proc-fs', mountPath: '/host/proc', readOnly: true },
      { name: 'etc-fs', mountPath: '/host/etc', readOnly: true },
      { name: 'rules', mountPath: '/etc/falco/rules.d' },
    ],
  });
}

function tetragonManifest(): string {
  return daemonSet(getSensor('tetragon')!, {
    args: ['--export-allowlist={}', '--enable-policy-filter', '--enable-process-cred', '--enable-process-ns'],
  });
}

function wazuhAgentManifest(): string {
  return daemonSet(getSensor('wazuh-agent')!, {
    env: [
      { name: 'WAZUH_MANAGER', value: `wazuh-manager.${NS}.svc.cluster.local` },
      { name: 'WAZUH_REGISTRATION_SERVER', value: `wazuh-manager.${NS}.svc.cluster.local` },
      { name: 'WAZUH_AGENT_GROUP', value: 'nexus-host' },
    ],
  });
}

function suricataManifest(): string {
  return daemonSet(getSensor('suricata')!, {
    args: ['-i', 'any', '--af-packet', '-v'],
    env: [{ name: 'SURICATA_OPTIONS', value: '-S /etc/suricata/rules/emerging-all.rules' }],
  });
}

function hubbleManifest(): string {
  return daemonSet(getSensor('hubble')!, {
    args: ['hubble-relay', 'serve', '--peer-service=cilium-agent.kube-system.svc.cluster.local:443'],
    ports: [{ containerPort: 4245, name: 'grpc' }, { containerPort: 9966, name: 'metrics' }],
  });
}

function opencanaryManifest(): string {
  return daemonSet(getSensor('opencanary')!, {
    args: ['opencanaryd', '--start'],
    env: [
      { name: 'CANARY_TOKEN_URL', value: `http://nexus-xdr-ingest.${NS}.svc.cluster.local:8080/canary` },
    ],
  });
}

/* ============================================================
   Cluster singletons — manager / SIEM / intel platform
   ============================================================ */

function singletonDeployment(sensor: SensorDefinition, extra: Record<string, unknown> = {}): string {
  return YAML.stringify({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: sensor.id, namespace: NS, labels: { 'app.kubernetes.io/name': sensor.id, 'app.kubernetes.io/managed-by': 'nexus-xdr' } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { 'app.kubernetes.io/name': sensor.id } },
      template: {
        metadata: { labels: { 'app.kubernetes.io/name': sensor.id } },
        spec: {
          containers: [
            {
              name: sensor.id,
              image: sensor.image,
              imagePullPolicy: 'IfNotPresent',
              resources: { requests: { cpu: '200m', memory: '512Mi' }, limits: { cpu: '2', memory: '4Gi' } },
              ...extra,
            },
          ],
        },
      },
    },
  });
}

function wazuhManagerManifest(): string {
  const sensor = getSensor('wazuh-manager')!;
  return [
    singletonDeployment(sensor, {
      ports: [
        { containerPort: 1514, name: 'agent-tcp' },
        { containerPort: 1514, name: 'agent-udp', protocol: 'UDP' },
        { containerPort: 1515, name: 'registration' },
        { containerPort: 55000, name: 'api' },
      ],
      env: [
        { name: 'INDEXER_URL', value: `https://opensearch.${NS}.svc.cluster.local:9200` },
        { name: 'INDEXER_USERNAME', valueFrom: { secretKeyRef: { name: 'wazuh-indexer', key: 'username' } } },
        { name: 'INDEXER_PASSWORD', valueFrom: { secretKeyRef: { name: 'wazuh-indexer', key: 'password' } } },
      ],
    }),
    YAML.stringify({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'wazuh-manager', namespace: NS },
      spec: {
        selector: { 'app.kubernetes.io/name': 'wazuh-manager' },
        ports: [
          { name: 'agent-tcp', port: 1514, targetPort: 1514 },
          { name: 'agent-udp', port: 1514, targetPort: 1514, protocol: 'UDP' },
          { name: 'registration', port: 1515, targetPort: 1515 },
          { name: 'api', port: 55000, targetPort: 55000 },
        ],
      },
    }),
  ].join('---\n');
}

function opensearchManifest(): string {
  const sensor = getSensor('opensearch')!;
  return [
    singletonDeployment(sensor, {
      ports: [{ containerPort: 9200, name: 'http' }, { containerPort: 9300, name: 'transport' }],
      env: [
        { name: 'discovery.type', value: 'single-node' },
        { name: 'OPENSEARCH_JAVA_OPTS', value: '-Xms2g -Xmx2g' },
        { name: 'OPENSEARCH_INITIAL_ADMIN_PASSWORD', valueFrom: { secretKeyRef: { name: 'opensearch-admin', key: 'password' } } },
      ],
    }),
    YAML.stringify({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'opensearch', namespace: NS },
      spec: {
        selector: { 'app.kubernetes.io/name': 'opensearch' },
        ports: [{ name: 'http', port: 9200, targetPort: 9200 }],
      },
    }),
  ].join('---\n');
}

function mispManifest(): string {
  return singletonDeployment(getSensor('misp')!, {
    ports: [{ containerPort: 80, name: 'http' }, { containerPort: 443, name: 'https' }],
    env: [
      { name: 'MYSQL_HOST', value: 'misp-db' },
      { name: 'MYSQL_PASSWORD', valueFrom: { secretKeyRef: { name: 'misp-db', key: 'password' } } },
      { name: 'MISP_FEEDS', value: 'threatfox,urlhaus,feodotracker,otx-alienvault,etopen' },
    ],
  });
}

/* ============================================================
   Admission webhooks — block at the gate
   ============================================================ */

function trivyManifest(): string {
  const sensor = getSensor('trivy')!;
  return [
    singletonDeployment(sensor, {
      args: ['--namespace=' + NS],
      env: [
        { name: 'OPERATOR_NAMESPACE', value: NS },
        { name: 'OPERATOR_TARGET_NAMESPACES', value: '' },
        { name: 'OPERATOR_SCAN_JOB_TIMEOUT', value: '5m' },
      ],
    }),
    YAML.stringify({
      apiVersion: 'admissionregistration.k8s.io/v1',
      kind: 'ValidatingWebhookConfiguration',
      metadata: { name: 'trivy-image-scanner', labels: { 'app.kubernetes.io/managed-by': 'nexus-xdr' } },
      webhooks: [
        {
          name: 'trivy.nexus.io',
          rules: [{ apiGroups: [''], apiVersions: ['v1'], operations: ['CREATE'], resources: ['pods'] }],
          clientConfig: { service: { name: 'trivy-operator', namespace: NS, path: '/validate' } },
          admissionReviewVersions: ['v1'],
          sideEffects: 'None',
          failurePolicy: 'Ignore',
          timeoutSeconds: 5,
        },
      ],
    }),
  ].join('---\n');
}

function polarisManifest(): string {
  const sensor = getSensor('polaris')!;
  return singletonDeployment(sensor, {
    args: ['webhook', '--port=9876', '--log-level=info'],
    ports: [{ containerPort: 9876, name: 'webhook' }],
  });
}

/* ============================================================
   CronJobs — periodic scans
   ============================================================ */

function cronJob(sensor: SensorDefinition, schedule: string, extra: Record<string, unknown> = {}): string {
  return YAML.stringify({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: { name: sensor.id, namespace: NS, labels: { 'app.kubernetes.io/name': sensor.id, 'app.kubernetes.io/managed-by': 'nexus-xdr' } },
    spec: {
      schedule,
      concurrencyPolicy: 'Forbid',
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 3,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: 'Never',
              hostPID: sensor.placement === 'cronjob' && sensor.covers.includes('host'),
              containers: [
                {
                  name: sensor.id,
                  image: sensor.image,
                  imagePullPolicy: 'IfNotPresent',
                  ...extra,
                },
              ],
            },
          },
        },
      },
    },
  });
}

function kubeBenchManifest(): string {
  return cronJob(getSensor('kube-bench')!, '@daily', {
    command: ['kube-bench'],
    args: ['run', '--json', '--outputfile=/results/kube-bench.json'],
    securityContext: { privileged: true },
  });
}

function kubeHunterManifest(): string {
  return cronJob(getSensor('kube-hunter')!, '@weekly', { command: ['kube-hunter', '--report=json'] });
}

function grypeManifest(): string {
  return cronJob(getSensor('grype')!, '0 */6 * * *', { command: ['grype', 'dir:/'] });
}

function syftManifest(): string {
  return cronJob(getSensor('syft')!, '@daily', { command: ['syft', 'dir:/', '-o', 'spdx-json'] });
}

function openscapManifest(): string {
  return cronJob(getSensor('openscap')!, '@daily', { command: ['oscap-podman', 'host', 'eval', '--profile', 'xccdf_org.ssgproject.content_profile_cis'] });
}

function lynisManifest(): string {
  return cronJob(getSensor('lynis')!, '@daily', { command: ['lynis', 'audit', 'system', '--quiet'] });
}

/* ============================================================
   Builder
   ============================================================ */

const MANIFEST_BUILDERS: Partial<Record<SensorId, () => string>> = {
  falco: falcoManifest,
  tetragon: tetragonManifest,
  'wazuh-agent': wazuhAgentManifest,
  'wazuh-manager': wazuhManagerManifest,
  suricata: suricataManifest,
  hubble: hubbleManifest,
  opensearch: opensearchManifest,
  misp: mispManifest,
  trivy: trivyManifest,
  polaris: polarisManifest,
  'kube-bench': kubeBenchManifest,
  'kube-hunter': kubeHunterManifest,
  grype: grypeManifest,
  syft: syftManifest,
  opencanary: opencanaryManifest,
  openscap: openscapManifest,
  lynis: lynisManifest,
};

export interface ManifestBundle {
  namespace: string;
  resources: { sensor: SensorId; kind: string; yaml: string }[];
  /** Convenience: every YAML doc joined with `---` separators. */
  combinedYaml: string;
  /** kubectl commands to apply the bundle. */
  applyCommands: string[];
}

/** Build the full manifest bundle for a chosen list of sensors. */
export function buildXdrDeploymentBundle(sensorIds: SensorId[]): ManifestBundle {
  const resources: ManifestBundle['resources'] = [];
  resources.push({ sensor: 'falco', kind: 'Namespace', yaml: ns() });

  for (const id of sensorIds) {
    const builder = MANIFEST_BUILDERS[id];
    if (!builder) continue;
    const yaml = builder();
    // each YAML can contain multiple docs separated by ---
    for (const part of yaml.split(/^---\n/m)) {
      if (!part.trim()) continue;
      const kindMatch = part.match(/^kind:\s*([A-Za-z]+)/m);
      const kind = kindMatch ? kindMatch[1] : 'Unknown';
      resources.push({ sensor: id, kind, yaml: part.trim() + '\n' });
    }
  }

  const combinedYaml = resources.map((r) => r.yaml).join('---\n');
  const applyCommands = [
    `# Apply the bundled Nexus XDR / MDR manifests (${resources.length} resources)`,
    `kubectl apply -f nexus-xdr.yaml`,
    `kubectl -n ${NS} wait deploy --for=condition=Available --timeout=180s --all`,
    `kubectl -n ${NS} get pods`,
  ];

  return { namespace: NS, resources, combinedYaml, applyCommands };
}

/** Convenience: bundle by security profile. */
export function buildXdrBundleForProfile(profile: SecurityProfile): ManifestBundle {
  return buildXdrDeploymentBundle(sensorsForProfile(profile));
}

/** All sensor ids that have a manifest generator (some are conceptual only). */
export function deployableSensorIds(): SensorId[] {
  return SENSORS.map((s) => s.id).filter((id) => MANIFEST_BUILDERS[id] !== undefined);
}

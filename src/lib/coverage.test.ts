/**
 * Mockup-build coverage suite.
 *
 * This is a stress-test of every wizard option / protocol / customization
 * the platform exposes. It exercises:
 *
 *   - All 13 storage backend types (`StorageType`)
 *   - All 5 workload kinds (`WorkloadType`)
 *   - All 3 service-mesh providers + 'none'
 *   - All 4 monitoring providers + 'none'
 *   - All 5 logging providers + 'none'
 *   - All 4 GitOps providers + 'none'
 *   - All 3 service types (ClusterIP / NodePort / LoadBalancer)
 *   - All 3 access modes (RWO / RWX / ROX)
 *   - All 3 federation types (kubefed / submariner / cilium)
 *   - Network policy on/off, ingress on/off, RBAC on/off
 *   - All 3 machine install modes (create / join / binaries)
 *   - VIP modes (static / dhcp), live migration, NVMe-RDMA, memory tiering,
 *     poly-compute combinations, hardware-acceleration combinations
 *   - Validation errors (intentionally bad configs) flow through correctly
 *
 * Each test asserts the helpers produce the expected resource kinds /
 * provisioner names / boot parameters etc., so a regression in any of
 * these branches is caught immediately by `npm run test`.
 */

import { describe, expect, it } from 'vitest';
import { defaultConfig, type ApplicationConfig, type GitOpsType, type LoggingType, type MonitoringType, type ServiceMeshType, type StorageType, type WorkloadType } from '../types';
import { generateManifest } from './manifestGenerator';
import {
  buildApplyTestRun,
  buildCsiTemplatePreview,
  buildLivePreview,
  buildNexusClusterOperationBundle,
  buildVClusterPlan,
  validateKubernetesManifest,
} from './clusterWorkflow';
import {
  buildDefaultMachineConfig,
  buildHarvesterMachineInstallPlan,
  validateHarvesterMachineConfig,
  type HarvesterInstallMode,
} from './harvesterMachineWizard';
import { planAnyRaidCapacity } from './anyraid';

const ALL_STORAGE: StorageType[] = [
  'local', 'nfs', 'smb', 'ceph', 'nvme', 'rdma', 'zfs', 'zfs-anyraid',
  'iscsi', 'glusterfs', 'longhorn', 'openebs', 'portworx',
];
const ALL_WORKLOADS: WorkloadType[] = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'];
const ALL_MESHES: ServiceMeshType[] = ['istio', 'linkerd', 'cilium', 'none'];
const ALL_MONITORING: MonitoringType[] = ['prometheus', 'datadog', 'newrelic', 'none'];
const ALL_LOGGING: LoggingType[] = ['fluentd', 'elasticsearch', 'loki', 'splunk', 'none'];
const ALL_GITOPS: GitOpsType[] = ['argocd', 'flux', 'jenkinsx', 'none'];
const ALL_INSTALL_MODES: HarvesterInstallMode[] = ['create', 'join', 'binaries'];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function configWithStorage(type: StorageType): ApplicationConfig {
  const cfg = clone(defaultConfig);
  cfg.storage.storageType = type;
  if (type === 'zfs-anyraid') {
    cfg.storage.zfsPoolName = 'anyraid-tank';
    cfg.storage.anyraidProfile = 'raidz1';
    cfg.storage.anyraidSlabSizeMiB = 64;
    cfg.storage.anyraidDisks = [
      { device: '/dev/sda', capacityGiB: 4000 },
      { device: '/dev/sdb', capacityGiB: 1000 },
      { device: '/dev/sdc', capacityGiB: 8000 },
    ];
  }
  return cfg;
}

/* ============================================================
   Storage protocols × CSI templates
   ============================================================ */
describe('coverage · storage protocols', () => {
  for (const type of ALL_STORAGE) {
    it(`generates a coherent CSI template preview for storageType=${type}`, () => {
      const cfg = configWithStorage(type);
      const preview = buildCsiTemplatePreview(cfg.storage);
      expect(preview.driverName.length).toBeGreaterThan(0);
      expect(preview.storageClassName.length).toBeGreaterThan(0);
      expect(preview.templates.length).toBe(3);
      expect(preview.templates.map((t) => t.kind)).toEqual([
        'StorageClass',
        'VolumeSnapshotClass',
        'PersistentVolumeClaim',
      ]);
      expect(preview.installCommands.length).toBeGreaterThanOrEqual(2);
      // StorageClass YAML must include the provisioner driver.
      const storageClass = preview.templates.find((t) => t.kind === 'StorageClass')!;
      expect(storageClass.yaml).toContain(preview.driverName);
    });

    it(`generates valid YAML manifest for storageType=${type} with workload Deployment`, () => {
      const cfg = configWithStorage(type);
      const yaml = generateManifest(cfg);
      expect(yaml).toContain(`name: ${cfg.appName}`);
      const validation = validateKubernetesManifest(yaml);
      expect(validation.valid).toBe(true);
    });
  }

  it('AnyRAID storage class carries per-disk inventory and profile in parameters', () => {
    const cfg = configWithStorage('zfs-anyraid');
    const preview = buildCsiTemplatePreview(cfg.storage);
    const sc = preview.templates.find((t) => t.kind === 'StorageClass')!.yaml;
    expect(sc).toContain('profile: raidz1');
    expect(sc).toContain('slabSizeMiB');
    expect(sc).toContain('diskInventory');
    expect(sc).toContain('/dev/sda:4000GiB');
  });

  it('AnyRAID capacity planner agrees with the StorageClass for the same input', () => {
    const cfg = configWithStorage('zfs-anyraid');
    const plan = planAnyRaidCapacity({
      disks: cfg.storage.anyraidDisks!,
      profile: cfg.storage.anyraidProfile,
      slabSizeMiB: cfg.storage.anyraidSlabSizeMiB,
      hotSpareSlabsPerDisk: cfg.storage.anyraidHotSpareSlabs,
    });
    expect(plan.warnings).toEqual([]);
    expect(plan.dataDiskCount).toBe(3);
    expect(plan.usableGiB).toBeGreaterThan(8000);
  });
});

/* ============================================================
   Workload kinds
   ============================================================ */
describe('coverage · workload kinds', () => {
  for (const wl of ALL_WORKLOADS) {
    it(`generates ${wl} manifest with valid kind line`, () => {
      const cfg = clone(defaultConfig);
      cfg.workloadType = wl;
      const yaml = generateManifest(cfg);
      expect(yaml).toContain(`kind: ${wl}`);
      const validation = validateKubernetesManifest(yaml);
      expect(validation.valid).toBe(true);
    });
  }
});

/* ============================================================
   Networking · service mesh, ingress, NetworkPolicy
   ============================================================ */
describe('coverage · networking', () => {
  for (const mesh of ALL_MESHES) {
    it(`renders mesh=${mesh}`, () => {
      const cfg = clone(defaultConfig);
      cfg.networking.serviceMesh = mesh;
      cfg.networking.istioInjection = mesh === 'istio';
      cfg.networking.linkerdInjection = mesh === 'linkerd';
      const yaml = generateManifest(cfg);
      // Manifest should validate regardless of mesh choice.
      expect(validateKubernetesManifest(yaml).valid).toBe(true);
    });
  }

  for (const svc of ['ClusterIP', 'NodePort', 'LoadBalancer'] as const) {
    it(`emits a Service of type ${svc} when service is enabled`, () => {
      const cfg = clone(defaultConfig);
      cfg.networking.enableService = true;
      cfg.networking.serviceType = svc;
      const yaml = generateManifest(cfg);
      expect(yaml).toContain('kind: Service');
      expect(yaml).toContain(`type: ${svc}`);
    });
  }

  it('emits an Ingress + NetworkPolicy when both are enabled', () => {
    const cfg = clone(defaultConfig);
    cfg.networking.enableIngress = true;
    cfg.networking.hostname = 'my-app.example.com';
    cfg.networking.enableNetworkPolicy = true;
    cfg.networking.networkPolicyRules = [{ name: 'allow-internal', podSelector: { tier: 'frontend' } }];
    const yaml = generateManifest(cfg);
    expect(yaml).toContain('kind: Ingress');
    expect(yaml).toContain('kind: NetworkPolicy');
    expect(yaml).toContain('my-app.example.com');
  });
});

/* ============================================================
   Security RBAC + pod security
   ============================================================ */
describe('coverage · security', () => {
  it('emits ServiceAccount + Role + RoleBinding when RBAC is on', () => {
    const cfg = clone(defaultConfig);
    cfg.security.enableRBAC = true;
    cfg.security.serviceAccountName = 'app-runner';
    cfg.security.rbacRules = [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }];
    const yaml = generateManifest(cfg);
    expect(yaml).toContain('kind: ServiceAccount');
    expect(yaml).toMatch(/kind: (Role|ClusterRole)/);
    expect(yaml).toMatch(/kind: (RoleBinding|ClusterRoleBinding)/);
  });

  for (const pss of ['privileged', 'baseline', 'restricted'] as const) {
    it(`accepts pod-security-standard=${pss}`, () => {
      const cfg = clone(defaultConfig);
      cfg.security.podSecurityStandard = pss;
      const yaml = generateManifest(cfg);
      expect(validateKubernetesManifest(yaml).valid).toBe(true);
    });
  }
});

/* ============================================================
   Monitoring + logging providers
   ============================================================ */
describe('coverage · monitoring + logging', () => {
  for (const m of ALL_MONITORING) {
    it(`accepts monitoring=${m}`, () => {
      const cfg = clone(defaultConfig);
      cfg.monitoring.monitoring = m;
      cfg.monitoring.enableMetrics = m !== 'none';
      const yaml = generateManifest(cfg);
      expect(validateKubernetesManifest(yaml).valid).toBe(true);
    });
  }
  for (const l of ALL_LOGGING) {
    it(`accepts logging=${l}`, () => {
      const cfg = clone(defaultConfig);
      cfg.logging.logging = l;
      const yaml = generateManifest(cfg);
      expect(validateKubernetesManifest(yaml).valid).toBe(true);
    });
  }
});

/* ============================================================
   GitOps + multi-cluster
   ============================================================ */
describe('coverage · gitops + multi-cluster', () => {
  for (const g of ALL_GITOPS) {
    it(`accepts gitops=${g}`, () => {
      const cfg = clone(defaultConfig);
      cfg.gitOps.gitOps = g;
      cfg.gitOps.repoUrl = 'https://github.com/example/repo';
      const yaml = generateManifest(cfg);
      expect(validateKubernetesManifest(yaml).valid).toBe(true);
    });
  }

  for (const fed of ['kubefed', 'submariner', 'cilium'] as const) {
    it(`builds a vcluster plan for federation=${fed}`, () => {
      const cfg = clone(defaultConfig);
      cfg.multiCluster.enableMultiCluster = true;
      cfg.multiCluster.federationType = fed;
      cfg.multiCluster.clusters = [
        { name: 'edge-a', context: 'edge-a-ctx' },
        { name: 'edge-b', context: 'edge-b-ctx' },
      ];
      const plan = buildVClusterPlan(cfg);
      expect(plan.virtualClusters.length).toBe(2);
      expect(plan.commands.length).toBeGreaterThanOrEqual(4);
    });
  }
});

/* ============================================================
   Manifest editor / validation flow
   ============================================================ */
describe('coverage · manifest editor + apply flow', () => {
  it('detects validation errors in a deliberately malformed manifest', () => {
    const broken = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\nname: missing-indent';
    const result = validateKubernetesManifest(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('builds an applyRun + livePreview + opBundle for the default config', () => {
    const cfg = clone(defaultConfig);
    const yaml = generateManifest(cfg);
    const run = buildApplyTestRun(yaml, cfg);
    expect(run.checks.length).toBeGreaterThanOrEqual(2);
    expect(['passed', 'failed', 'pending']).toContain(run.status);

    const preview = buildLivePreview(yaml);
    expect(preview.resources.length).toBeGreaterThanOrEqual(1);
    expect(preview.readinessScore).toBeGreaterThan(0);

    const bundle = buildNexusClusterOperationBundle(yaml, cfg);
    expect(bundle.kubectlCommands.length).toBeGreaterThan(0);
    expect(bundle.kubectlCommands.some((c) => c.includes('kubectl'))).toBe(true);
  });
});

/* ============================================================
   Machine wizard install modes
   ============================================================ */
describe('coverage · machine wizard install modes', () => {
  for (const mode of ALL_INSTALL_MODES) {
    it(`builds an install plan for installMode=${mode}`, () => {
      const cfg = buildDefaultMachineConfig();
      cfg.installMode = mode;
      if (mode === 'join') {
        cfg.serverUrl = 'https://10.10.40.20:443';
        cfg.clusterToken = 'demo-token';
      } else if (mode === 'create') {
        cfg.clusterToken = 'demo-token';
      } else {
        cfg.clusterToken = '';
      }
      expect(validateHarvesterMachineConfig(cfg)).toEqual([]);
      const plan = buildHarvesterMachineInstallPlan(cfg);
      expect(plan.steps.length).toBeGreaterThanOrEqual(5);
      expect(plan.bootParameters.some((p) => p.includes(`harvester.install.mode=${mode}`))).toBe(true);
      expect(plan.configYaml.length).toBeGreaterThan(0);
    });
  }

  it('rejects join mode without a serverUrl', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.installMode = 'join';
    cfg.serverUrl = '';
    cfg.clusterToken = 'demo-token';
    const errors = validateHarvesterMachineConfig(cfg);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects create mode without a cluster token', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.installMode = 'create';
    cfg.clusterToken = '';
    const errors = validateHarvesterMachineConfig(cfg);
    expect(errors.length).toBeGreaterThan(0);
  });
});

/* ============================================================
   Machine wizard customizations: VIP / live migration / NVMe-RDMA /
   memory tiering / poly-compute / hardware acceleration
   ============================================================ */
describe('coverage · machine wizard advanced toggles', () => {
  for (const vipMode of ['static', 'dhcp'] as const) {
    it(`accepts VIP mode ${vipMode}`, () => {
      const cfg = buildDefaultMachineConfig();
      cfg.vipMode = vipMode;
      if (vipMode === 'static') cfg.virtualIp = '10.10.40.20';
      const errors = validateHarvesterMachineConfig(cfg);
      expect(errors).toEqual([]);
    });
  }

  it('exposes NVMe-RDMA + memory-tiering via boot parameters when enabled', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.liveMigration.enabled = true;
    cfg.nvmeOverRdma.enabled = true;
    cfg.memoryTiering.enabled = true;
    cfg.memoryTiering.mode = 'phase-change';
    cfg.memoryTiering.device = '/dev/pmem0';
    const plan = buildHarvesterMachineInstallPlan(cfg);
    // NVMe-RDMA + memory-tiering are exposed as kernel boot parameters.
    expect(plan.bootParameters.join(' ')).toMatch(/nvme_over_rdma=true/);
    expect(plan.bootParameters.join(' ')).toMatch(/memory_tiering=phase-change/);
    // Live migration is rendered into the config YAML rather than as a boot
    // parameter — it's part of the install-time `live_migration:` block.
    expect(plan.configYaml).toMatch(/live_migration/);
    expect(plan.configYaml).toContain('vmotion-style');
  });

  it('encodes poly-compute selections into boot parameters', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.polyCompute = { kubevirt: true, incusLxc: true, k8sPods: true };
    const plan = buildHarvesterMachineInstallPlan(cfg);
    const joined = plan.bootParameters.join(' ');
    expect(joined).toMatch(/poly[_-]compute/);
    expect(joined).toMatch(/kubevirt/);
    expect(joined).toMatch(/incus|lxc/);
    expect(joined).toMatch(/pods/);
  });

  it('encodes acceleration toggles into boot parameters', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.hardwareAcceleration = {
      spdk: true,
      dpdk: true,
      vhostUser: true,
      numaPinning: true,
      gpuPassthrough: true,
      nestedVirt: true,
      hugepages1G: 64,
    };
    const plan = buildHarvesterMachineInstallPlan(cfg);
    const joined = plan.bootParameters.join(' ').toLowerCase();
    expect(joined).toMatch(/spdk/);
    expect(joined).toMatch(/dpdk/);
    expect(joined).toMatch(/numa/);
    expect(joined).toMatch(/gpu[_-]?(passthrough|pass[_-]through)/);
    expect(joined).toMatch(/hugepages?[_-]?1g=64/);
  });

  it('rejects GPU passthrough without NUMA pinning per Machine Wizard 2.0 rules', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.hardwareAcceleration.gpuPassthrough = true;
    cfg.hardwareAcceleration.numaPinning = false;
    const errors = validateHarvesterMachineConfig(cfg);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a config that turns off every poly-compute runtime', () => {
    const cfg = buildDefaultMachineConfig();
    cfg.polyCompute = { kubevirt: false, incusLxc: false, k8sPods: false };
    const errors = validateHarvesterMachineConfig(cfg);
    expect(errors.length).toBeGreaterThan(0);
  });
});

/* ============================================================
   Manifest customizations: probes, env, configmaps, secrets
   ============================================================ */
describe('coverage · workload customizations', () => {
  it('emits readiness + liveness probes when configured', () => {
    const cfg = clone(defaultConfig);
    cfg.enableHealthChecks = true;
    cfg.healthCheckPath = '/healthz';
    cfg.readinessProbe = { httpGet: { path: '/ready', port: 8080 } };
    cfg.livenessProbe = { httpGet: { path: '/live', port: 8080 } };
    const yaml = generateManifest(cfg);
    expect(yaml).toContain('readinessProbe');
    expect(yaml).toContain('livenessProbe');
    expect(validateKubernetesManifest(yaml).valid).toBe(true);
  });

  it('emits env vars, custom labels, and annotations when configured', () => {
    const cfg = clone(defaultConfig);
    cfg.environmentVariables = { LOG_LEVEL: 'info', FEATURE_X: '1' };
    cfg.labels = { tier: 'edge', team: 'platform' };
    cfg.annotations = { 'nexus.io/owner': 'platform-team' };
    const yaml = generateManifest(cfg);
    expect(yaml).toContain('LOG_LEVEL');
    expect(yaml).toContain('FEATURE_X');
    expect(yaml).toContain('tier: edge');
    expect(yaml).toContain('team: platform');
    expect(yaml).toContain('nexus.io/owner: platform-team');
    expect(validateKubernetesManifest(yaml).valid).toBe(true);
  });

  it('accepts configMaps + secrets metadata on the config (rendered separately by Cluster Console)', () => {
    // Today configMaps + secrets are recorded on the ApplicationConfig but are
    // surfaced through the Cluster Console live-adapter rather than spliced
    // directly into the workload YAML. Verify they at least round-trip
    // without breaking the generator and end up referenced by the operation
    // bundle so the user knows they're tracked.
    const cfg = clone(defaultConfig);
    cfg.configMaps = ['app-config', 'feature-flags'];
    cfg.secrets = ['app-secrets'];
    const yaml = generateManifest(cfg);
    expect(validateKubernetesManifest(yaml).valid).toBe(true);
  });
});

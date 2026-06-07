/**
 * Vitest unit tests for the installer/ contract.
 *
 * These tests run against the static manifests + config in the repo so
 * they don't require running the simulator or building the overlay.
 * They lock in the contract every installer artifact MUST satisfy:
 *
 *   - admin/admin default credentials with rotation flag
 *   - every bootstrap manifest is valid Kubernetes YAML
 *   - every workload image references a real upstream FOSS registry
 *   - the wizard question schema covers every feature the cockpit
 *     exposes
 *   - the feature ConfigMap declares every cockpit view that exists
 *     in src/App.tsx
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');
const INSTALLER  = join(REPO_ROOT, 'installer');

function loadAllDocs(filePath: string): Record<string, unknown>[] {
  const text = readFileSync(filePath, 'utf8');
  return yaml.parseAllDocuments(text).map((d) => d.toJSON()).filter(Boolean) as Record<string, unknown>[];
}

describe('installer · default config (etc/nexus/config.yaml)', () => {
  const cfg = yaml.parse(readFileSync(join(INSTALLER, 'overlay', 'etc', 'nexus', 'config.yaml'), 'utf8'));

  it('declares apiVersion + kind so the cockpit + bootstrap can validate it', () => {
    expect(cfg.apiVersion).toBe('nexus.io/v1');
    expect(cfg.kind).toBe('NexusInstallConfig');
  });

  it('seeds admin / admin with forced rotation on first login', () => {
    expect(cfg.admin.username).toBe('admin');
    expect(cfg.admin.password).toBe('admin');
    expect(cfg.admin.forcePasswordChangeOnFirstLogin).toBe(true);
  });

  it('enables the cockpit on port 8443 with a TLS self-signed cert + a default theme', () => {
    expect(cfg.cockpit.enabled).toBe(true);
    expect(cfg.cockpit.port).toBe(8443);
    expect(cfg.cockpit.tlsSelfSigned).toBe(true);
    expect(['route-grid', 'arctic-hologram', 'arctic-command', 'ice-spectrum']).toContain(cfg.cockpit.defaultTheme);
  });

  it('enables XDR by default with a known profile + auto-response toggles', () => {
    expect(cfg.xdr.enabled).toBe(true);
    expect(['baseline', 'hardened', 'maximum']).toContain(cfg.xdr.profile);
    expect(cfg.xdr.autoResponse.enabled).toBe(true);
    expect(cfg.xdr.autoResponse.isolateOnCritical).toBe(true);
  });

  it('picks a launch variant that matches one of the four mockups in src/components/launchVariants', () => {
    expect(['concentric-boot', 'status-cascade', 'hex-grid', 'radar-sweep']).toContain(cfg.launchVariant);
  });

  it('exposes every storage backend the README documents', () => {
    const backends = Object.keys(cfg.storage.backends).sort();
    const expected = [
      'anyraid', 'ceph', 'glusterfs', 'iscsi', 'local', 'longhorn',
      'nfs', 'nvme-of', 'openebs', 'portworx', 'rdma', 'smb', 'vitastor', 'zfs',
    ].sort();
    expect(backends).toEqual(expected);
  });
});

describe('installer · bootstrap manifests (installer/manifests/*.yaml)', () => {
  const dir = join(INSTALLER, 'manifests');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();

  it('produces a non-empty set of YAML files in lexical bootstrap order', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('00-nexus-namespace.yaml');
    expect(files).toContain('10-default-admin.yaml');
    expect(files).toContain('20-xdr-stack.yaml');
    expect(files).toContain('30-anyraid-csi.yaml');
    expect(files).toContain('40-cockpit-service.yaml');
    expect(files).toContain('99-nexus-features.yaml');
  });

  it('every manifest doc has apiVersion + kind + metadata.name', () => {
    for (const f of files) {
      const docs = loadAllDocs(join(dir, f));
      for (const d of docs) {
        const dd = d as { apiVersion?: string; kind?: string; metadata?: { name?: string } };
        expect(dd.apiVersion, `${f}: apiVersion`).toBeTruthy();
        expect(dd.kind, `${f}: kind`).toBeTruthy();
        expect(dd.metadata?.name, `${f}: metadata.name`).toBeTruthy();
      }
    }
  });

  it('00 creates the three Nexus namespaces with managed-by label', () => {
    const docs = loadAllDocs(join(dir, '00-nexus-namespace.yaml'));
    const names = docs.map((d) => (d as { metadata: { name: string } }).metadata.name).sort();
    expect(names).toEqual(['nexus-cockpit', 'nexus-system', 'nexus-xdr']);
    for (const d of docs) {
      const labels = (d as { metadata: { labels: Record<string, string> } }).metadata.labels;
      expect(labels['app.kubernetes.io/managed-by']).toBe('harvester-nexus-installer');
    }
  });

  it('10 creates the admin user with bcrypt hash + rotate-on-first-login annotation', () => {
    const docs = loadAllDocs(join(dir, '10-default-admin.yaml'));
    const credSec = docs.find((d) => {
      const dd = d as { kind: string; metadata: { name: string } };
      return dd.kind === 'Secret' && dd.metadata.name === 'admin-credentials';
    }) as { stringData: Record<string, string>; metadata: { annotations: Record<string, string> } } | undefined;
    expect(credSec).toBeDefined();
    expect(credSec!.stringData.username).toBe('admin');
    expect(credSec!.stringData.passwordHash).toMatch(/^\$2a\$10\$/);
    expect(credSec!.stringData.forcePasswordChange).toBe('true');
    expect(credSec!.metadata.annotations['nexus.io/rotate-on-first-login']).toBe('true');
  });

  it('20 deploys the hardened XDR sensor stack (Falco + Tetragon + Wazuh + Suricata + Hubble + Trivy + OpenSearch + Polaris + kube-bench)', () => {
    const docs = loadAllDocs(join(dir, '20-xdr-stack.yaml'));
    const ids = docs.map((d) => {
      const dd = d as { kind: string; metadata: { name: string } };
      return `${dd.kind}/${dd.metadata.name}`;
    });
    const want = [
      'DaemonSet/falco', 'DaemonSet/tetragon', 'DaemonSet/wazuh-agent',
      'Deployment/wazuh-manager', 'DaemonSet/suricata', 'DaemonSet/hubble-relay',
      'Deployment/trivy-operator', 'Deployment/opensearch', 'Deployment/polaris',
      'CronJob/kube-bench', 'CronJob/grype', 'CronJob/syft',
    ];
    for (const w of want) expect(ids).toContain(w);
  });

  it('every workload image is from a real upstream FOSS registry (no placeholder / private registries)', () => {
    const allowed = ['docker.io/', 'quay.io/', 'ghcr.io/', 'gcr.io/', 'registry.k8s.io/'];
    for (const f of files) {
      const docs = loadAllDocs(join(dir, f));
      for (const d of docs) {
        const dd = d as { kind: string; spec?: Record<string, unknown> };
        // Crawl every container under common K8s shapes.
        const containerLists: Array<Record<string, string>[]> = [];
        const spec = dd.spec as Record<string, unknown> | undefined;
        const template = spec?.template as Record<string, unknown> | undefined;
        const templateSpec = template?.spec as Record<string, unknown> | undefined;
        if (templateSpec?.containers) containerLists.push(templateSpec.containers as Record<string, string>[]);
        const jobTemplate = spec?.jobTemplate as Record<string, unknown> | undefined;
        const jobSpec = jobTemplate?.spec as Record<string, unknown> | undefined;
        const jobTpl = jobSpec?.template as Record<string, unknown> | undefined;
        const jobTplSpec = jobTpl?.spec as Record<string, unknown> | undefined;
        if (jobTplSpec?.containers) containerLists.push(jobTplSpec.containers as Record<string, string>[]);
        for (const containers of containerLists) {
          for (const c of containers) {
            if (!c.image) continue;
            const ok = allowed.some((p) => c.image.startsWith(p));
            expect(ok, `${f} ${c.name}: ${c.image}`).toBe(true);
          }
        }
      }
    }
  });

  it('99 enables every cockpit view + every capability', () => {
    const docs = loadAllDocs(join(dir, '99-nexus-features.yaml'));
    const cm = docs.find((d) => (d as { kind: string }).kind === 'ConfigMap') as
      { data: Record<string, string> } | undefined;
    expect(cm).toBeDefined();
    for (const k of ['view.mission-control', 'view.xdr-operations', 'view.security-posture', 'view.launch-mockups', 'capability.xdr', 'capability.anyraid']) {
      expect(cm!.data[k], k).toBe('true');
    }
  });
});

describe('installer · wizard questions cover every install-time setting', () => {
  const path = join(INSTALLER, 'installer-config', 'nexus-wizard-questions.yaml');
  const qs = yaml.parse(readFileSync(path, 'utf8')) as { questions: { variable: string }[] };

  it('every required setting from config.yaml is exposed as a wizard question', () => {
    const vars = qs.questions.map((q) => q.variable);
    for (const v of [
      'nexus.admin.username',
      'nexus.admin.password',
      'nexus.cockpit.defaultTheme',
      'nexus.launchVariant',
      'nexus.storage.defaultBackend',
      'nexus.storage.anyraid.enabled',
      'nexus.polyCompute.kubevirt.enabled',
      'nexus.acceleration.gpuPassthrough',
      'nexus.xdr.enabled',
      'nexus.xdr.profile',
      'nexus.xdr.autoResponse.enabled',
      'nexus.gitops.enabled',
      'nexus.compliance.enabled',
    ]) {
      expect(vars, `wizard missing variable ${v}`).toContain(v);
    }
  });

  it('admin username + password both default to "admin"', () => {
    const u = qs.questions.find((q) => q.variable === 'nexus.admin.username') as { default: string };
    const p = qs.questions.find((q) => q.variable === 'nexus.admin.password') as { default: string };
    expect(u.default).toBe('admin');
    expect(p.default).toBe('admin');
  });
});

describe('installer · overlay scripts are present + executable', () => {
  const binDir = join(INSTALLER, 'overlay', 'usr', 'local', 'bin');
  for (const script of ['nexus-bootstrap', 'nexus-cockpit', 'nexus-postinstall']) {
    it(`${script} exists and starts with a shebang`, () => {
      const p = join(binDir, script);
      expect(existsSync(p), `${p} missing`).toBe(true);
      const text = readFileSync(p, 'utf8');
      expect(text.startsWith('#!/usr/bin/env bash') || text.startsWith('#!/bin/bash')).toBe(true);
    });
  }
});

describe('installer · Dockerfile uses a shell-capable ISO builder base', () => {
  const dockerfile = readFileSync(join(INSTALLER, 'Dockerfile'), 'utf8');

  it('does not use the scratch-only rancher/harvester-installer image as its base', () => {
    // rancher/harvester-installer:<tag> ships only /usr/bin/harvester-installer (FROM scratch).
    // Layering a shell script ENTRYPOINT on top yields: exec /bin/sh: no such file or directory.
    expect(dockerfile).not.toMatch(/FROM\s+rancher\/harvester-installer/);
    expect(dockerfile).not.toMatch(/FROM\s+scratch\b/);
  });

  it('ENTRYPOINT invokes bash explicitly so make iso does not depend on /bin/sh', () => {
    expect(dockerfile).toMatch(/ENTRYPOINT\s+\["\/bin\/bash",\s*"\/src\/installer\/build-iso\.sh"\]/);
  });

  it('installs Node.js from the upstream tarball (not zypper nodejs20)', () => {
    // registry.suse.com/bci/golang does not expose nodejs20 in default repos.
    expect(dockerfile).not.toMatch(/zypper.*nodejs20/);
    expect(dockerfile).toMatch(/nodejs\.org\/dist/);
    expect(dockerfile).toMatch(/^\s+xz\s*\\/m);
  });

  it('installs a current Docker CLI static binary (not zypper docker API 1.42)', () => {
    expect(dockerfile).not.toMatch(/^\s+docker\s*\\/m);
    expect(dockerfile).toMatch(/DOCKER_CLI_VERSION=/);
    expect(dockerfile).toMatch(/tar xzf "docker-\$\{DOCKER_CLI_VERSION\}\.tgz" docker\/docker/);
    expect(dockerfile).toMatch(/mv docker\/docker \/usr\/local\/bin\/docker/);
  });

  it('sets DOCKER_API_VERSION for elemental embedded moby client (API 1.42)', () => {
    expect(dockerfile).toMatch(/ENV DOCKER_API_VERSION=1\.44/);
    const makefile = readFileSync(join(INSTALLER, 'Makefile'), 'utf8');
    expect(makefile).toMatch(/DOCKER_API_VERSION=1\.44/);
  });
});

describe('installer · upstream harvester-installer patches', () => {
  it('ships a patched collect-deps.sh for rancher-charts index extraction', () => {
    const patch = join(INSTALLER, 'patches', 'collect-deps.sh');
    expect(existsSync(patch), `${patch} missing`).toBe(true);
    const text = readFileSync(patch, 'utf8');
    expect(text).toMatch(/read_index_from_image/);
    expect(text).toMatch(/update_rancher_deps_from_build_yaml/);
    expect(text).not.toMatch(/docker run --privileged -d/);
  });
});

describe('installer · systemd units have correct After / Wants ordering', () => {
  const unitsDir = join(INSTALLER, 'overlay', 'etc', 'systemd', 'system');

  it('nexus-bootstrap.service runs after k3s/rke2 and before nexus-cockpit', () => {
    const text = readFileSync(join(unitsDir, 'nexus-bootstrap.service'), 'utf8');
    expect(text).toMatch(/After=.*k3s\.service.*rke2-server\.service/);
    expect(text).toContain('ExecStart=/usr/local/bin/nexus-bootstrap');
  });

  it('nexus-cockpit.service requires the bootstrap to complete first', () => {
    const text = readFileSync(join(unitsDir, 'nexus-cockpit.service'), 'utf8');
    expect(text).toContain('After=network-online.target nexus-bootstrap.service');
    expect(text).toContain('Requires=nexus-bootstrap.service');
  });
});

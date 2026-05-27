import { describe, expect, it } from 'vitest';
import { buildXdrBundleForProfile, buildXdrDeploymentBundle, deployableSensorIds } from './manifests';
import { sensorsForProfile } from './sensors';

describe('XDR · manifest bundle', () => {
  it('every sensor with a manifest generator emits at least one resource', () => {
    for (const id of deployableSensorIds()) {
      const bundle = buildXdrDeploymentBundle([id]);
      // 1 Namespace + ≥1 sensor resource
      expect(bundle.resources.length).toBeGreaterThanOrEqual(2);
      const yamls = bundle.resources.map((r) => r.yaml).join('\n');
      expect(yamls).toContain(`name: ${id}`);
    }
  });

  it('combinedYaml separates docs with --- markers', () => {
    const bundle = buildXdrDeploymentBundle(['falco', 'tetragon']);
    expect(bundle.combinedYaml).toContain('---');
    expect(bundle.combinedYaml).toMatch(/kind: DaemonSet/);
  });

  it('baseline / hardened / maximum profiles produce monotonically larger bundles', () => {
    const baseline = buildXdrBundleForProfile('baseline');
    const hardened = buildXdrBundleForProfile('hardened');
    const maximum = buildXdrBundleForProfile('maximum');
    expect(baseline.resources.length).toBeLessThan(hardened.resources.length);
    expect(hardened.resources.length).toBeLessThanOrEqual(maximum.resources.length);
  });

  it('baseline bundle includes Falco, Wazuh agent + manager, Trivy, kube-bench, Hubble', () => {
    const bundle = buildXdrBundleForProfile('baseline');
    const sensors = new Set(bundle.resources.map((r) => r.sensor));
    for (const must of ['falco', 'trivy', 'kube-bench', 'wazuh-manager', 'wazuh-agent', 'hubble']) {
      expect(sensors.has(must as never)).toBe(true);
    }
  });

  it('every manifest references the sensor image (real upstream FOSS reference)', () => {
    const bundle = buildXdrBundleForProfile('maximum');
    const text = bundle.combinedYaml;
    expect(text).toMatch(/docker\.io\/falcosecurity\/falco/);
    expect(text).toMatch(/quay\.io\/cilium\/tetragon/);
    expect(text).toMatch(/docker\.io\/wazuh\/wazuh-agent/);
    expect(text).toMatch(/ghcr\.io\/aquasecurity\/trivy-operator/);
    expect(text).toMatch(/jasonish\/suricata/);
    expect(text).toMatch(/opensearchproject\/opensearch/);
  });

  it('admission webhook (Trivy) registers a ValidatingWebhookConfiguration', () => {
    const bundle = buildXdrDeploymentBundle(['trivy']);
    expect(bundle.combinedYaml).toContain('ValidatingWebhookConfiguration');
  });

  it('CronJob sensors (kube-bench, grype, syft, openscap, lynis) emit batch/v1 CronJob', () => {
    for (const id of ['kube-bench', 'grype', 'syft', 'openscap', 'lynis'] as const) {
      const bundle = buildXdrDeploymentBundle([id]);
      expect(bundle.combinedYaml).toContain('apiVersion: batch/v1');
      expect(bundle.combinedYaml).toContain('kind: CronJob');
    }
  });

  it('applyCommands are non-empty and contain a kubectl apply', () => {
    const bundle = buildXdrBundleForProfile('hardened');
    expect(bundle.applyCommands.length).toBeGreaterThan(0);
    expect(bundle.applyCommands.some((c) => c.includes('kubectl apply'))).toBe(true);
  });

  it('hardened profile sensors all have manifest generators (no silent drops)', () => {
    const hardened = sensorsForProfile('hardened');
    const bundle = buildXdrDeploymentBundle(hardened);
    const emitted = new Set(bundle.resources.map((r) => r.sensor));
    for (const id of hardened) expect(emitted.has(id)).toBe(true);
  });
});

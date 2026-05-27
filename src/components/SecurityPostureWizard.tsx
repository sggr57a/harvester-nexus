import { useMemo, useState } from 'react';
import { SENSORS, getSensor, sensorsForProfile, type SecurityProfile } from '../lib/xdr/sensors';
import { INTEL_FEEDS } from '../lib/xdr/intel';
import { RULES } from '../lib/xdr/rules';
import { buildXdrDeploymentBundle } from '../lib/xdr/manifests';
import type { SensorId } from '../lib/xdr/types';

const PROFILE_LABELS: Record<SecurityProfile, { title: string; description: string }> = {
  baseline: {
    title: 'Baseline',
    description: 'Falco + Wazuh + Trivy + Hubble + kube-bench. Minimal-footprint sensors that cover the major attack chains.',
  },
  hardened: {
    title: 'Hardened',
    description: 'Baseline + Tetragon active enforcement, Suricata IDS, OpenSearch event lake, Polaris admission, Grype + Syft, SBOM generation.',
  },
  maximum: {
    title: 'Maximum',
    description: 'Hardened + MISP intel platform, OpenCanary honeypots, OpenSCAP + Lynis host hardening, kube-hunter pen-test.',
  },
};

export function SecurityPostureWizard() {
  const [profile, setProfile] = useState<SecurityProfile>('hardened');
  const [extraSensors, setExtraSensors] = useState<Set<SensorId>>(new Set());

  const activeSensors = useMemo<SensorId[]>(() => {
    const base = new Set<SensorId>(sensorsForProfile(profile));
    for (const id of extraSensors) base.add(id);
    return Array.from(base);
  }, [profile, extraSensors]);

  const bundle = useMemo(() => buildXdrDeploymentBundle(activeSensors), [activeSensors]);

  const toggleSensor = (id: SensorId) => {
    const next = new Set(extraSensors);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExtraSensors(next);
  };

  const baseSet = new Set(sensorsForProfile(profile));
  const optional = SENSORS.filter((s) => !baseSet.has(s.id));

  return (
    <section className="security-posture-wizard">
      <header className="security-posture-header">
        <div>
          <span className="dash-kicker">XDR · MDR · SECURITY POSTURE</span>
          <h2>Security posture &amp; sensor stack</h2>
          <p>
            Pick a security profile and add any optional sensors. Every component is open-source —
            Falco, Tetragon, Wazuh, Trivy, Suricata, Hubble, MISP, OpenCanary, OpenSCAP, Lynis,
            kube-bench, kube-hunter, Polaris, OpenSearch — and is deployed via real Kubernetes
            manifests. The bundle below is what the operator runs to stand the stack up.
          </p>
        </div>
        <div className="security-posture-summary">
          <div><span>Sensors active</span><strong>{activeSensors.length}<em> / {SENSORS.length}</em></strong></div>
          <div><span>Detection rules</span><strong>{RULES.length}</strong></div>
          <div><span>Intel feeds</span><strong>{INTEL_FEEDS.length}</strong></div>
          <div><span>K8s resources</span><strong>{bundle.resources.length}</strong></div>
        </div>
      </header>

      <div className="profile-picker">
        {(Object.keys(PROFILE_LABELS) as SecurityProfile[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`profile-card ${profile === p ? 'is-active' : ''}`}
            onClick={() => setProfile(p)}
          >
            <strong>{PROFILE_LABELS[p].title}</strong>
            <small>{PROFILE_LABELS[p].description}</small>
            <b>{sensorsForProfile(p).length} sensors</b>
          </button>
        ))}
      </div>

      <article className="dash-panel sensor-grid-panel">
        <header className="panel-title">
          <span>Sensors in this profile</span>
          <strong>{activeSensors.length} active</strong>
        </header>
        <ul className="sensor-grid">
          {activeSensors.map((id) => {
            const s = getSensor(id)!;
            return (
              <li key={id} className="sensor-card sensor-active">
                <header>
                  <strong>{s.name}</strong>
                  <small>{s.license}</small>
                </header>
                <p>{s.summary}</p>
                <dl>
                  <div><dt>VENDOR</dt><dd>{s.vendor}</dd></div>
                  <div><dt>VERSION</dt><dd>{s.version}</dd></div>
                  <div><dt>PLACEMENT</dt><dd>{s.placement}</dd></div>
                  <div><dt>COVERS</dt><dd>{s.covers.length > 0 ? s.covers.join(' · ') : 'cluster-level'}</dd></div>
                </dl>
                <a href={s.homepage} target="_blank" rel="noreferrer noopener" className="sensor-homepage">{s.homepage}</a>
              </li>
            );
          })}
        </ul>
      </article>

      {optional.length > 0 && (
        <article className="dash-panel sensor-grid-panel">
          <header className="panel-title">
            <span>Optional add-ons</span>
            <strong>{optional.length} available</strong>
          </header>
          <ul className="sensor-grid">
            {optional.map((s) => {
              const isOn = extraSensors.has(s.id);
              return (
                <li key={s.id} className={`sensor-card ${isOn ? 'sensor-active' : 'sensor-inactive'}`}>
                  <header>
                    <strong>{s.name}</strong>
                    <small>{s.license}</small>
                  </header>
                  <p>{s.summary}</p>
                  <dl>
                    <div><dt>VENDOR</dt><dd>{s.vendor}</dd></div>
                    <div><dt>VERSION</dt><dd>{s.version}</dd></div>
                  </dl>
                  <button type="button" className="sensor-toggle" onClick={() => toggleSensor(s.id)}>
                    {isOn ? '✓ enabled — click to remove' : '+ add to bundle'}
                  </button>
                </li>
              );
            })}
          </ul>
        </article>
      )}

      <article className="dash-panel">
        <header className="panel-title">
          <span>Generated Kubernetes manifest</span>
          <strong>{bundle.resources.length} resources · namespace {bundle.namespace}</strong>
        </header>
        <pre className="xdr-bundle-yaml">{bundle.combinedYaml}</pre>
        <div className="xdr-bundle-cmds">
          {bundle.applyCommands.map((c) => (
            <code key={c}>{c}</code>
          ))}
        </div>
      </article>

      <article className="dash-panel">
        <header className="panel-title">
          <span>Detection rule catalog</span>
          <strong>{RULES.length} Sigma-style rules</strong>
        </header>
        <ul className="rule-list">
          {RULES.map((r) => (
            <li key={r.id} className={`rule-card sev-${r.severity}`}>
              <header>
                <code>{r.id}</code>
                <strong>{r.title}</strong>
                <em>{r.severity}</em>
              </header>
              <p>{r.description}</p>
              <small>
                tactics: {r.tactics.join(' · ')} · techniques: {r.techniques.join(', ')} · requires:{' '}
                {r.requires.join(', ')}
              </small>
            </li>
          ))}
        </ul>
      </article>

      <article className="dash-panel">
        <header className="panel-title">
          <span>Threat-intel feeds (all free)</span>
          <strong>{INTEL_FEEDS.length} feeds</strong>
        </header>
        <ul className="intel-feeds-list">
          {INTEL_FEEDS.map((f) => (
            <li key={f.id}>
              <strong>{f.name}</strong>
              <small>{f.vendor} · {f.license} · refresh {Math.round(f.refreshIntervalSeconds / 60)} min</small>
              {f.homepage ? (
                <a href={f.homepage} target="_blank" rel="noreferrer noopener">{f.homepage}</a>
              ) : null}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

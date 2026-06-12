import type { MachineRow } from '../../lib/dashboards';
import { useClusterXdrEngine } from '../../lib/telemetry/useClusterXdrEngine';
import type { LiveXdrSlice } from '../../lib/telemetry/dashboardTypes';
import type { TelemetryState } from '../../lib/telemetry/mode';
import { SENSORS } from '../../lib/xdr/sensors';
import { RULES } from '../../lib/xdr/rules';
import { INTEL_FEEDS } from '../../lib/xdr/intel';
import { ThreatSurface3D } from './ThreatSurface3D';

interface XdrOperationsCenterProps {
  telemetry?: TelemetryState;
  xdrLive?: LiveXdrSlice;
  fleet?: MachineRow[];
}

/** XDR Operations Center — demo uses synthetic APT scenario; live uses real cluster inventory only. */
export function XdrOperationsCenter({ telemetry, xdrLive, fleet }: XdrOperationsCenterProps = {}) {
  const mode = telemetry?.mode ?? 'demo';
  const { snap, simulate, sensorsLive, isDemo } = useClusterXdrEngine(
    telemetry ?? { mode: 'demo', requested: 'auto', liveAvailable: false, clusterReady: false },
    xdrLive,
    fleet,
  );

  return (
    <section className="dash dash-xdr-soc" aria-label="XDR / MDR operations center">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">SOC // XDR-MDR {simulate ? 'DEMO' : 'LIVE'}</span>
          <h2>XDR / MDR operations center</h2>
          <p>
            {simulate
              ? 'Demo mode — synthetic endpoints (payments-vm, fraud-lxc, edge-a) and a scripted attack scenario. Not shown in live mode.'
              : 'Live mode — endpoints from your Harvester cluster only. Deploy Nexus XDR sensors to ingest Falco/Tetragon/Wazuh events.'}
            {' '}
            {RULES.length} detection rules; {INTEL_FEEDS.length} intel feeds.
            {sensorsLive && xdrLive
              ? ` Sensors ${xdrLive.sensorsHealthy}/${xdrLive.sensorsTotal} healthy.`
              : !isDemo && !sensorsLive
                ? ' No XDR sensor pods detected in nexus-xdr namespace yet.'
                : ''}
          </p>
        </div>
        <div className="dash-totals">
          <div><span>Mode</span><strong>{mode}</strong></div>
          <div><span>Alerts/min</span><strong>{snap.stats.alertsPerMin}</strong></div>
          <div><span>Blocked 24h</span><strong>{snap.stats.blocked24h}</strong></div>
          <div><span>Isolated hosts</span><strong>{snap.stats.isolatedHosts}</strong></div>
          <div><span>Active APTs</span><strong>{snap.stats.activeAptCount}</strong></div>
        </div>
      </header>

      <ThreatSurface3D snapshot={snap} />

      {!isDemo && snap.endpoints.length === 0 && (
        <article className="dash-panel live-empty-panel">
          <p><strong>No cluster endpoints registered</strong></p>
          <small>
            Create VMs or deploy workloads to tenant namespaces — they appear here for XDR correlation.
            Demo names like edge-a, payments-vm-01, and fraud-lxc-01 are never shown in live mode.
          </small>
        </article>
      )}

      <div className="xdr-soc-grid">
        <article className="dash-panel">
          <header className="panel-title">
            <span>Endpoint inventory</span>
            <strong>{snap.endpoints.length} endpoints · {snap.stats.sensorsHealthy} sensors deployed</strong>
          </header>
          <ul className="xdr-endpoint-list">
            {snap.endpoints.map((ep) => (
              <li key={ep.id} className={`xdr-endpoint status-${ep.status}`}>
                <header>
                  <strong>{ep.name}</strong>
                  <em className={`kind-chip kind-${ep.kind}`}>{ep.kind}</em>
                  <small>{ep.status}</small>
                </header>
                <dl>
                  <div><dt>HOST</dt><dd>{ep.host}</dd></div>
                  <div><dt>IP</dt><dd>{ep.ip}</dd></div>
                  <div><dt>SENSORS</dt><dd>{ep.sensors.join(', ') || '—'}</dd></div>
                  {ep.os && <div><dt>OS</dt><dd>{ep.os}</dd></div>}
                  {ep.group && <div><dt>GROUP</dt><dd>{ep.group}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <header className="panel-title">
            <span>Recent alerts</span>
            <strong>{snap.alerts.length} in window</strong>
          </header>
          <ul className="xdr-alert-list">
            {snap.alerts.slice().reverse().slice(0, 20).map((a) => (
              <li key={a.id} className={`xdr-alert sev-${a.severity}`}>
                <header>
                  <code>{a.ruleId}</code>
                  <strong>{a.ruleTitle}</strong>
                  <em>{a.severity}</em>
                </header>
                <p>
                  <span className="xdr-alert-endpoint">{a.endpointId}</span>
                  {' · '}
                  {a.tactics.join(' · ')}
                </p>
                {a.matchedIndicators.length > 0 && (
                  <small>
                    IOC: {a.matchedIndicators.map((i) => `${i.kind}=${i.value}`).join(', ')}
                  </small>
                )}
              </li>
            ))}
            {snap.alerts.length === 0 && (
              <li className="xdr-alert sev-low">
                <em>
                  {simulate
                    ? 'No alerts yet — waiting for the simulator to emit events…'
                    : 'No alerts yet — waiting for sensor events from the cluster…'}
                </em>
              </li>
            )}
          </ul>
        </article>

        <article className="dash-panel">
          <header className="panel-title">
            <span>Auto-dispatched response actions</span>
            <strong>{snap.responses.length} actions</strong>
          </header>
          <ul className="xdr-response-list">
            {snap.responses.slice().reverse().slice(0, 15).map((r) => (
              <li key={r.id} className={`xdr-response action-${r.kind}`}>
                <header>
                  <strong>{r.kind}</strong>
                  <em>{r.status}</em>
                </header>
                <p>{r.summary}</p>
                <small>endpoint: {r.endpointId} · approval: {r.requiresApproval ? 'required' : 'auto'}</small>
              </li>
            ))}
            {snap.responses.length === 0 && (
              <li className="xdr-response"><em>No responses dispatched yet.</em></li>
            )}
          </ul>
        </article>

        <article className="dash-panel">
          <header className="panel-title">
            <span>MITRE ATT&amp;CK kill-chain coverage (24h)</span>
            <strong>{Object.values(snap.killChainCounts).reduce((a, b) => a + b, 0)} total</strong>
          </header>
          <div className="xdr-killchain-grid">
            {Object.entries(snap.killChainCounts).map(([tactic, count]) => (
              <div key={tactic} className={`xdr-killchain-cell ${count > 0 ? 'is-hit' : ''}`}>
                <span>{tactic.replace(/-/g, ' ')}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <header className="panel-title">
            <span>Active threat attribution</span>
            <strong>{snap.activeThreats.length} actors observed</strong>
          </header>
          <ul className="xdr-actor-list">
            {snap.activeThreats.map((t) => (
              <li key={t.id} className={`xdr-actor sev-${t.severity}`}>
                <header>
                  <strong>{t.actor}</strong>
                  <em>{t.country} · {t.city}</em>
                </header>
                <p>
                  {t.cve} · {t.malware} · {t.tactic} · {t.iocCount} IOC hits
                </p>
                <small>
                  src {t.ip} · recommended action: <code>{t.action}</code>
                </small>
              </li>
            ))}
            {snap.activeThreats.length === 0 && (
              <li className="xdr-actor"><em>No active attribution yet.</em></li>
            )}
          </ul>
        </article>

        <article className="dash-panel">
          <header className="panel-title">
            <span>Sensor health</span>
            <strong>
              {xdrLive?.deployed
                ? `${xdrLive.sensorsHealthy} / ${xdrLive.sensorsTotal} cluster pods`
                : `${snap.stats.sensorsHealthy} / ${snap.stats.sensorsTotal}`}
            </strong>
          </header>
          <ul className="xdr-sensor-list">
            {SENSORS.map((s) => (
              <li key={s.id} className="xdr-sensor">
                <header>
                  <strong>{s.name}</strong>
                  <em>{s.license}</em>
                </header>
                <small>{s.placement} · covers {s.covers.join(', ') || 'cluster'}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

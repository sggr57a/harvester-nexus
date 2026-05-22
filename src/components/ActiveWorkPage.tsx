import { buildResourceMonitoring } from '../lib/activeOperations';

const operations = buildResourceMonitoring();

function points(samples: number[]): string {
  return samples.map((value, index) => `${(index / (samples.length - 1)) * 100},${100 - value}`).join(' ');
}

export function ResourceMonitoringPage() {
  return (
    <section className="active-work-page hud-panel" aria-label="Resource monitoring and live security audit cockpit">
      <div className="active-work-bg-grid" />
      <div className="hud-panel-title active-work-title">
        <span>{operations.pageTitle} // important active systems</span>
        <strong>{operations.summary.activeWorkCount} operations / risk {operations.summary.highestSecurityScore}</strong>
      </div>

      <nav className="active-work-menu" aria-label="Resource monitoring cockpit menu">
        {operations.menuItems.map((item, index) => (
          <button className={index === 0 ? 'is-selected' : ''} key={item.id} type="button" style={{ animationDelay: `${index * 110}ms` }}>
            <span>{item.signal}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="active-work-layout">
        <div className="active-work-stack">
          {operations.workItems.map((item, index) => (
            <article className={`active-work-card status-${item.status}`} key={item.id} style={{ animationDelay: `${index * 140}ms` }}>
              <div>
                <span>{item.kind.replace('-', ' ')}</span>
                <strong>{item.label}</strong>
                <small>{item.target}</small>
              </div>
              <div className="active-work-meter">
                <i style={{ width: `${item.progress}%` }} />
              </div>
              <b>{item.progress}%</b>
            </article>
          ))}
        </div>

        <div className="active-resource-grid">
          {operations.resourceGraphs.map((graph, index) => (
            <article className="active-graph-card" key={graph.label} style={{ animationDelay: `${index * 120}ms` }}>
              <div className="active-graph-head">
                <span>{graph.label}</span>
                <strong>{graph.samples[graph.samples.length - 1]}{graph.unit}</strong>
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={points(graph.samples)} />
                {graph.samples.map((sample, sampleIndex) => (
                  <circle key={`${graph.label}-${sampleIndex}`} cx={(sampleIndex / (graph.samples.length - 1)) * 100} cy={100 - sample} r="1.5" />
                ))}
              </svg>
            </article>
          ))}
        </div>

        <div className="resource-monitoring-list">
          <div className="hud-panel-title">
            <span>Always monitored</span>
            <strong>{operations.monitoredResourceClasses.length} classes</strong>
          </div>
          <div>
            {operations.monitoredResourceClasses.map((resourceClass) => (
              <span key={resourceClass}>{resourceClass}</span>
            ))}
          </div>
          {operations.memoryPressure.visible && (
            <article className={`memory-pressure-card ${operations.memoryPressure.severity}`}>
              <span>Memory pressure</span>
              <strong>{operations.memoryPressure.node} / {operations.memoryPressure.pressurePercent}%</strong>
              <small>Shown only because pressure crossed the issue threshold.</small>
            </article>
          )}
          <div className="migration-process-list">
            {operations.migrationProcesses.map((migration) => (
              <article key={migration.id}>
                <span>{migration.workloadType}</span>
                <strong>{migration.sourceNode} {'->'} {migration.targetNode}</strong>
                <small>{migration.processModel}; memory state preserved; no shutdown required</small>
                <i style={{ width: `${migration.progress}%` }} />
              </article>
            ))}
          </div>
        </div>

        <aside className="security-audit-stack">
          <div className="security-sweep">
            <span />
            <i />
            <b>PVE</b>
          </div>
          {operations.securityAudits.map((audit, index) => (
            <article className="security-audit-card" key={audit.id} style={{ animationDelay: `${index * 170}ms` }}>
              <div>
                <span>{audit.signal}</span>
                <strong>{audit.vulnerabilityType} / {audit.riskScore}</strong>
              </div>
              <p>{audit.target}</p>
              <small>{audit.recommendedAction}</small>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}

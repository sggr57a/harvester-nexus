import type { TelemetryDataSource } from '../../lib/telemetry/dashboardAdapters';

interface LiveEmptyPanelProps {
  title: string;
  detail?: string;
}

export function LiveEmptyPanel({ title, detail }: LiveEmptyPanelProps) {
  return (
    <article className="dash-panel live-empty-panel" aria-live="polite">
      <div className="panel-title">
        <span>No cluster resources</span>
        <strong>live mode</strong>
      </div>
      <p><strong>{title}</strong></p>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

interface DemoCatalogPlaceholderProps {
  viewName: string;
  dataSource?: TelemetryDataSource;
}

/** Shown in live mode for views that only contain simulated demo catalog data. */
export function DemoCatalogPlaceholder({ viewName, dataSource }: DemoCatalogPlaceholderProps) {
  if (dataSource !== 'live') return null;
  return (
    <section className="dash live-catalog-placeholder" aria-label={`${viewName} live mode notice`}>
      <article className="dash-panel live-empty-panel">
        <div className="panel-title">
          <span>{viewName}</span>
          <strong>live cluster</strong>
        </div>
        <p>
          This view is a <strong>demo layout preview</strong> with simulated workloads, GPUs, and storage backends.
          It is hidden in live mode because those resources are not installed on your cluster.
        </p>
        <small>
          Use Mission Control, Storage, Machines, or Resource Monitor for measurements from your Harvester node.
          Switch telemetry to <strong>Demo</strong> in the ticker header to explore the full mock catalog.
        </small>
      </article>
    </section>
  );
}

import { useMemo, useState } from 'react';
import type { EnvironmentSnapshot } from '../../lib/liveTelemetry';
import { findHarvesterNavItem } from '../../lib/harvester/harvesterNav';
import { useHarvesterResources } from '../../lib/harvester/useHarvesterResources';
import { buildGenericActions, buildVmActions } from '../../lib/harvester/harvesterVmActions';
import { harvesterDashboardDeepLink } from '../../lib/harvester/harvesterSteveClient';
import { HCI, type HarvesterResourceRow, type HarvesterResourceType } from '../../lib/harvester/harvesterTypes';
import type { TelemetryState } from '../../lib/telemetry/mode';
import { KpiTile, MultiRingGauge, SparklineGrid, WidgetTitle } from '../dashboards/Widgets';

interface HarvesterResourceViewProps {
  resourceType: HarvesterResourceType;
  telemetry: EnvironmentSnapshot;
  telemetryState: TelemetryState;
  onOpenNexusView?: (view: string) => void;
}

function stateClass(state: HarvesterResourceRow['state']): string {
  switch (state) {
    case 'running':
    case 'ready':
      return 'hv-state-good';
    case 'pending':
    case 'migrating':
    case 'paused':
      return 'hv-state-warn';
    case 'error':
    case 'degraded':
    case 'stopped':
      return 'hv-state-danger';
    default:
      return 'hv-state-dim';
  }
}

function tableColumns(type: HarvesterResourceType): { key: string; label: string; render: (row: HarvesterResourceRow) => string }[] {
  const base: { key: string; label: string; render: (row: HarvesterResourceRow) => string }[] = [
    { key: 'state', label: 'State', render: (row: HarvesterResourceRow) => row.state },
    { key: 'name', label: 'Name', render: (row: HarvesterResourceRow) => row.name },
  ];
  if (type !== HCI.HOST && type !== HCI.STORAGE && type !== HCI.SETTING && type !== HCI.ADD_ONS) {
    base.push({ key: 'namespace', label: 'Namespace', render: (row) => row.namespace ?? '—' });
  }
  if (type === HCI.VM || type === HCI.HOST) {
    base.push(
      { key: 'cpu', label: 'CPU', render: (row) => row.cpu ?? '—' },
      { key: 'memory', label: 'Memory', render: (row) => row.memory ?? '—' },
      { key: 'node', label: 'Node', render: (row) => row.node ?? '—' },
    );
  }
  if (type === HCI.VOLUME) {
    base.push(
      { key: 'storageClass', label: 'Storage Class', render: (row) => row.storageClass ?? '—' },
      { key: 'size', label: 'Size', render: (row) => row.size ?? '—' },
    );
  }
  if (type === HCI.IMAGE) {
    base.push({ key: 'size', label: 'Size', render: (row) => row.size ?? '—' });
  }
  base.push({ key: 'age', label: 'Age', render: (row) => row.age });
  return base;
}

export function HarvesterResourceView({
  resourceType,
  telemetry,
  telemetryState,
  onOpenNexusView,
}: HarvesterResourceViewProps) {
  const navItem = findHarvesterNavItem(resourceType);
  const { loading, list } = useHarvesterResources(resourceType, telemetryState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return list.rows;
    return list.rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.namespace ?? '').toLowerCase().includes(q) ||
        (row.node ?? '').toLowerCase().includes(q),
    );
  }, [filter, list.rows]);

  const selectedRow = useMemo(
    () => list.rows.find((row) => selected.size === 1 && selected.has(row.id)) ?? null,
    [list.rows, selected],
  );

  const actions = resourceType === HCI.VM
    ? buildVmActions(selectedRow, selected.size)
    : buildGenericActions(navItem?.creatable ?? false);

  const columns = tableColumns(resourceType);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAction = (actionId: string) => {
    if (actionId === 'create') {
      onOpenNexusView?.('create-workload');
      return;
    }
    if (actionId === 'refresh') {
      setActionMessage('Refreshing from Harvester Steve API…');
      return;
    }
    const label = actions.find((a) => a.id === actionId)?.label ?? actionId;
    const targets = selected.size > 0 ? [...selected].join(', ') : selectedRow?.name ?? 'selection';
    setActionMessage(`${label} queued for ${targets} (demo — emits kubectl subresource in production)`);
  };

  return (
    <section className="dash dash-harvester-resource hud-panel-draw" aria-label={navItem?.label ?? 'Harvester resource'}>
      <header className="dash-header hv-resource-header">
        <div>
          <span className="dash-kicker">HARVESTER // {navItem?.sig ?? 'RESOURCE'}</span>
          <h2>{navItem?.label ?? resourceType}</h2>
          <p>
            Native Harvester controls with Nexus HUD styling.
            {' '}
            <span className={`hv-source-badge hv-source-${list.dataSource}`}>
              {list.dataSource === 'live' ? 'Live cluster' : 'Demo catalog'}
            </span>
          </p>
        </div>
        <div className="dash-totals hv-metric-strip">
          <div><span>Resources</span><strong>{list.total}</strong></div>
          <div><span>Cluster CPU</span><strong>{telemetry.cpuPercent.toFixed(1)}%</strong></div>
          <div><span>Cluster RAM</span><strong>{telemetry.ramPercent.toFixed(1)}%</strong></div>
          <div><span>IOPS</span><strong>{(telemetry.totalIops / 1000).toFixed(0)}k</strong></div>
        </div>
      </header>

      <div className="hv-action-bar">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`hv-action-btn ${action.danger ? 'is-danger' : ''} ${!action.enabled ? 'is-disabled' : ''}`}
            disabled={!action.enabled}
            onClick={() => runAction(action.id)}
            title={action.label}
          >
            <span className="hv-action-icon">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
        <a
          className="hv-action-btn hv-deep-link"
          href={harvesterDashboardDeepLink(resourceType)}
          target="_blank"
          rel="noreferrer"
        >
          <span className="hv-action-icon">↗</span>
          <span>Open in Harvester</span>
        </a>
      </div>

      {actionMessage && (
        <div className="hv-action-toast" role="status">{actionMessage}</div>
      )}

      <div className="hv-resource-toolbar">
        <input
          className="hv-filter-input"
          placeholder="Filter by name, namespace, or node…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="hv-loading-indicator">{loading ? 'Syncing…' : `Showing ${filteredRows.length}`}</span>
      </div>

      <div className="hv-resource-table-wrap">
        <table className="hv-resource-table">
          <thead>
            <tr>
              <th scope="col" className="hv-col-check" />
              {columns.map((col) => (
                <th key={col.key} scope="col">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className={selected.has(row.id) ? 'is-selected' : ''}
                onClick={() => toggleRow(row.id)}
              >
                <td className="hv-col-check">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                {columns.map((col) => (
                  <td key={col.key} className={col.key === 'state' ? stateClass(row.state) : ''}>
                    {col.key === 'state' ? (
                      <span className="hv-state-pill">{col.render(row)}</span>
                    ) : (
                      col.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="hv-empty-row">
                  No resources match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface HarvesterDashboardViewProps {
  telemetry: EnvironmentSnapshot;
  telemetryState: TelemetryState;
  onNavigate: (type: HarvesterResourceType) => void;
}

export function HarvesterDashboardView({ telemetry, telemetryState, onNavigate }: HarvesterDashboardViewProps) {
  const { dashboard } = useHarvesterResources(HCI.DASHBOARD, telemetryState);
  const rings = useMemo(
    () => [
      { label: 'CPU', value: dashboard.cpuPercent, color: 'accent' as const },
      { label: 'Memory', value: dashboard.ramPercent, color: 'accent-2' as const },
      { label: 'Storage', value: dashboard.storageTotalTiB > 0 ? (dashboard.storageUsedTiB / dashboard.storageTotalTiB) * 100 : 0, color: 'good' as const },
      { label: 'Trust', value: telemetry.trustScore, color: 'warn' as const },
    ],
    [dashboard, telemetry.trustScore],
  );

  const sparkChannels = useMemo(
    () => [
      { label: 'CPU %', values: [telemetry.cpuPercent * 0.9, telemetry.cpuPercent * 0.95, telemetry.cpuPercent, telemetry.cpuPercent * 1.02, telemetry.cpuPercent], current: telemetry.cpuPercent, unit: '%' },
      { label: 'RAM %', values: [telemetry.ramPercent * 0.88, telemetry.ramPercent * 0.92, telemetry.ramPercent, telemetry.ramPercent * 1.01, telemetry.ramPercent], current: telemetry.ramPercent, unit: '%' },
      { label: 'IOPS k', values: [telemetry.totalIops / 1200, telemetry.totalIops / 1100, telemetry.totalIops / 1000, telemetry.totalIops / 1050, telemetry.totalIops / 1000], current: telemetry.totalIops / 1000, unit: 'k' },
      { label: 'Ingress', values: [telemetry.ingressMbps * 0.8, telemetry.ingressMbps * 0.9, telemetry.ingressMbps, telemetry.ingressMbps * 1.1, telemetry.ingressMbps], current: telemetry.ingressMbps, unit: 'Mb/s' },
    ],
    [telemetry],
  );

  return (
    <section className="dash dash-harvester-dashboard hud-panel-draw" aria-label="Harvester Dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">HARVESTER // CLUSTER OVERVIEW</span>
          <h2>Dashboard</h2>
          <p>
            Harvester cluster health with Nexus metrics overlay — version {dashboard.clusterVersion}.
            {' '}
            <span className={`hv-source-badge hv-source-${dashboard.dataSource}`}>
              {dashboard.dataSource === 'live' ? 'Live cluster' : 'Demo catalog'}
            </span>
          </p>
        </div>
        <div className="dash-totals">
          <div><span>Nodes</span><strong>{dashboard.nodeCount}</strong></div>
          <div><span>VMs</span><strong>{dashboard.vmCount}</strong></div>
          <div><span>Volumes</span><strong>{dashboard.volumeCount}</strong></div>
          <div><span>Images</span><strong>{dashboard.imageCount}</strong></div>
        </div>
      </header>

      <div className="hv-dashboard-grid">
        <article className="hud-panel hv-dash-kpi-bank">
          <WidgetTitle kicker="CLUSTER KPI" title="Resource counts" />
          <div className="hv-kpi-row">
            <KpiTile label="Hosts" value={String(dashboard.nodeCount)} delta={0} status="good" />
            <KpiTile label="Virtual Machines" value={String(dashboard.vmCount)} delta={2} status="good" />
            <KpiTile label="Volumes" value={String(dashboard.volumeCount)} delta={1} status="good" />
            <KpiTile label="Workloads" value={String(telemetry.totalWorkloads)} hint="live tick" status="good" />
          </div>
        </article>

        <article className="hud-panel hv-dash-rings">
          <WidgetTitle kicker="POSTURE" title="Cluster utilisation" />
          <MultiRingGauge rings={rings} size={180} />
          <p className="hv-storage-caption">
            Storage {dashboard.storageUsedTiB} / {dashboard.storageTotalTiB} TiB used
          </p>
        </article>

        <article className="hud-panel hv-dash-spark">
          <WidgetTitle kicker="TELEMETRY" title="Live cluster traces" />
          <SparklineGrid items={sparkChannels} columns={2} />
        </article>

        <article className="hud-panel hv-dash-shortcuts">
          <WidgetTitle kicker="NAVIGATE" title="Harvester resources" />
          <div className="hv-shortcut-grid">
            {[
              { type: HCI.VM, label: 'Virtual Machines', count: dashboard.vmCount },
              { type: HCI.HOST, label: 'Hosts', count: dashboard.nodeCount },
              { type: HCI.VOLUME, label: 'Volumes', count: dashboard.volumeCount },
              { type: HCI.IMAGE, label: 'Images', count: dashboard.imageCount },
              { type: HCI.NETWORK_ATTACHMENT, label: 'Networks', count: 3 },
              { type: HCI.SETTING, label: 'Settings', count: 5 },
            ].map((item) => (
              <button
                key={item.type}
                type="button"
                className="hv-shortcut-btn"
                onClick={() => onNavigate(item.type)}
              >
                <strong>{item.label}</strong>
                <span>{item.count} resources</span>
              </button>
            ))}
          </div>
        </article>

        <article className="hud-panel hv-dash-events">
          <WidgetTitle kicker="EVENTS" title="Recent cluster activity" />
          <ul className="hv-event-list">
            {dashboard.recentEvents.map((event, index) => (
              <li key={index} className={`hv-event hv-event-${event.level}`}>
                <time>{event.time}</time>
                <span>{event.message}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

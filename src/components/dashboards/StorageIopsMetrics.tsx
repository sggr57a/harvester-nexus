import type { EnvironmentStorageIops } from '../../lib/telemetry/storageIops';
import { formatDiskMetric, storageIopsTotals } from '../../lib/telemetry/storageIops';
import { WidgetTitle } from './Widgets';

export function StorageIopsTotals({
  summary,
}: {
  summary?: EnvironmentStorageIops;
}) {
  return (
    <>
      {storageIopsTotals(summary).map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </>
  );
}

export function StorageIopsPanel({
  summary,
  title = 'Local disk IOPS',
}: {
  summary?: EnvironmentStorageIops;
  title?: string;
}) {
  const disks = summary?.devices ?? [];
  const waiting = summary?.totalIops == null;
  const source = summary?.source ?? 'unavailable';
  return (
    <article className="dash-panel storage-iops-panel" aria-label="Local disk IOPS">
      <WidgetTitle
        kicker="DISK IO"
        title={title}
        trailing={
          <span className="osc-readout">
            {waiting ? '—' : `${formatDiskMetric(summary?.totalIops)} IOPS`}
            {' · '}
            {source}
          </span>
        }
      />
      {waiting ? (
        <p>
          Waiting for a second <code>/proc/diskstats</code> sample so IOPS can be measured (not estimated).
        </p>
      ) : disks.length === 0 ? (
        <p>No local disks reported I/O in <code>/proc/diskstats</code>.</p>
      ) : (
        <ul className="passthrough-list storage-iops-list">
          {disks.map((disk) => (
            <li key={disk.device}>
              <span className="kind-chip">disk</span>
              <strong>{disk.device}</strong>
              <small>
                {formatDiskMetric(disk.iops)} IOPS
                {' · R '}
                {formatDiskMetric(disk.readIops)}
                {' · W '}
                {formatDiskMetric(disk.writeIops)}
                {' · '}
                {formatDiskMetric(disk.readMiBs, 2)} / {formatDiskMetric(disk.writeMiBs, 2)} MiB/s
              </small>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

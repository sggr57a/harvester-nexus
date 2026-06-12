import type { ConsoleChip, MachineRow, PvcRow } from '../lib/dashboards';
import { consoleChipsForMachine, describeConsole, storageVolumesForMachine } from '../lib/machineConsole';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

interface MachineDetailPanelProps {
  machine: MachineRow;
  pvcs?: PvcRow[];
  dataSource?: TelemetryDataSource;
  onOpenConsole: (chip: ConsoleChip) => void;
  onClose: () => void;
}

export function MachineDetailPanel({
  machine,
  pvcs = [],
  dataSource,
  onOpenConsole,
  onClose,
}: MachineDetailPanelProps) {
  const volumes = storageVolumesForMachine(machine, pvcs);
  const chips = consoleChipsForMachine(machine);
  const isLive = dataSource === 'live';

  return (
    <article className="machine-detail-panel dash-panel" aria-label={`Details for ${machine.name}`}>
      <header className="machine-detail-header">
        <div>
          <span className="dash-kicker">WORKLOAD // DETAIL</span>
          <h3>{machine.name}</h3>
          <p>
            <span className={`kind-chip kind-${machine.kind}`}>{machine.kind}</span>
            {' · '}
            {machine.host}
            {machine.namespace ? ` · ns ${machine.namespace}` : ''}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close detail panel">
          Close
        </button>
      </header>

      <div className="machine-detail-grid">
        <section>
          <h4>Compute</h4>
          <dl className="machine-detail-dl">
            <div><dt>CPU</dt><dd>{machine.cpuPercent}%</dd></div>
            <div><dt>RAM</dt><dd>{machine.ramGiB} / {machine.ramAllocGiB} GiB</dd></div>
            <div><dt>Status</dt><dd><span className={`status-chip status-${machine.status}`}>{machine.status}</span></dd></div>
            <div><dt>HA</dt><dd>{machine.haEnabled ? 'enabled' : 'off'}</dd></div>
            <div><dt>Affinity</dt><dd>{machine.affinity}</dd></div>
            {machine.guestProfile && (
              <div><dt>Guest</dt><dd>{machine.guestProfile.replace(/-/g, ' ')}</dd></div>
            )}
            {machine.shell && machine.guestProfile === 'linux-shell' && (
              <div><dt>Shell</dt><dd>{machine.shell}</dd></div>
            )}
            {machine.desktopEnvironment && (
              <div><dt>Desktop</dt><dd>{machine.desktopEnvironment}</dd></div>
            )}
          </dl>
        </section>

        <section>
          <h4>Network</h4>
          {machine.networks?.length ? (
            <ul className="machine-detail-list">
              {machine.networks.map((net) => (
                <li key={net.name}>
                  <strong>{net.name}</strong>
                  {net.ip && <span>{net.ip}</span>}
                  {net.mac && <small>{net.mac}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="machine-detail-muted">
              {(machine.netRxMbps ?? machine.netTxMbps)
                ? `RX ${machine.netRxMbps ?? 0} Mbps · TX ${machine.netTxMbps ?? 0} Mbps`
                : isLive
                  ? 'No interface details from collector yet.'
                  : 'eth0 · demo network'}
            </p>
          )}
        </section>

        <section>
          <h4>Storage</h4>
          {volumes && volumes.length > 0 ? (
            <ul className="machine-detail-list">
              {volumes.map((vol) => (
                <li key={vol.name}>
                  <strong>{vol.name}</strong>
                  <span>{vol.sizeGiB} GiB</span>
                  {vol.storageClass && <small>{vol.storageClass}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="machine-detail-muted">No attached volumes in this namespace.</p>
          )}
        </section>
      </div>

      <section className="machine-console-section">
        <h4>Console</h4>
        <p className="machine-detail-muted">
          {machine.status !== 'running'
            ? 'Console unavailable while workload is not running.'
            : 'Windows and Linux desktop VMs open a graphical session; shell-only Linux and containers open a terminal.'}
        </p>
        <div className="console-chips">
          {chips.length === 0 && (
            <span className="machine-detail-muted">No console for this workload state.</span>
          )}
          {chips.map((chip) => {
            const info = describeConsole(machine, chip.type);
            return (
              <button
                key={chip.id}
                type="button"
                className={`console-chip type-${chip.type}`}
                onClick={() => onOpenConsole(chip)}
                disabled={machine.status !== 'running'}
                title={info.hint}
              >
                <span>{info.presentation === 'graphical' ? 'VNC' : 'TTY'}</span>
                <strong>{info.label}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </article>
  );
}

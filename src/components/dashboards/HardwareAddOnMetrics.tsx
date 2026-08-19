import type { EnvironmentAcceleratorSummary } from '../../lib/telemetry/hardwareAddOn';
import { hardwareAddOnTotals } from '../../lib/telemetry/hardwareAddOn';
import { WidgetTitle } from './Widgets';

export function HardwareAddOnTotals({
  summary,
}: {
  summary?: EnvironmentAcceleratorSummary;
}) {
  return (
    <>
      {hardwareAddOnTotals(summary).map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </>
  );
}

export function HardwareAddOnPanel({
  summary,
  title = 'NPU / TPU / FPGA / GPU',
}: {
  summary?: EnvironmentAcceleratorSummary;
  title?: string;
}) {
  const cards = summary?.devices ?? [];
  const waiting = summary?.waitingForHardware ?? [];
  return (
    <article className="dash-panel hardware-addon-panel" aria-label="Add-in accelerator cards">
      <WidgetTitle
        kicker="ACCEL"
        title={title}
        trailing={
          <span className="osc-readout">
            {summary?.cards ?? 0} cards · {summary?.issues ?? 0} issues
          </span>
        }
      />
      {cards.length === 0 ? (
        <p>
          No allowlisted add-in cards on this node.
          {waiting.length > 0 ? ` Waiting: ${waiting.join(', ')}.` : ''}
        </p>
      ) : (
        <ul className="passthrough-list">
          {cards.map((dev) => (
            <li key={dev.id} className={`pt-${dev.kind === 'npu' ? 'fpga' : dev.kind}`}>
              <span className="kind-chip">{dev.kind}</span>
              <strong>{dev.model}</strong>
              <small>
                {dev.id}
                {dev.driver ? ` · ${dev.driver}` : ''}
                {dev.temperatureC == null ? '' : ` · ${dev.temperatureC}°C`}
                {dev.currentLinkSpeed ? ` · ${dev.currentLinkSpeed}` : ''}
                {dev.linkDownshifted ? ' · link downshifted' : ''}
                {dev.issues?.length ? ` · ${dev.issues.join(', ')}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

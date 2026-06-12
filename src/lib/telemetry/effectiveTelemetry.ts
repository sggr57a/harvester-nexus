import type { EnvironmentSnapshot } from '../liveTelemetry';
import type { HudClusterModel } from '../hudClusterModel';

function avg(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Fill sparse live telemetry with HUD node aggregates — demo mode only. Live mode returns real values as-is. */
export function withTelemetryFallbacks(
  telemetry: EnvironmentSnapshot | undefined,
  model: HudClusterModel,
  options?: { liveMode?: boolean },
): EnvironmentSnapshot | undefined {
  if (!telemetry || options?.liveMode) return telemetry;

  const avgCpu = avg(
    model.nodes.map((node) => node.cpu),
    40,
  );
  const avgRam = avg(
    model.nodes.map((node) => node.ram),
    55,
  );
  const totalPower = model.nodes.reduce((sum, node) => sum + node.power, 0);
  const totalNet = model.nodes.reduce((sum, node) => sum + node.net, 0);
  const totalDisk = model.nodes.reduce((sum, node) => sum + node.disk, 0);

  return {
    ...telemetry,
    cpuPercent: telemetry.cpuPercent > 0 ? telemetry.cpuPercent : avgCpu,
    ramPercent: telemetry.ramPercent > 0 ? telemetry.ramPercent : avgRam,
    watts: telemetry.watts > 0 ? telemetry.watts : totalPower || 660,
    ingressMbps: telemetry.ingressMbps > 0 ? telemetry.ingressMbps : totalNet * 100,
    egressMbps: telemetry.egressMbps > 0 ? telemetry.egressMbps : totalNet * 92,
    totalIops: telemetry.totalIops > 0 ? telemetry.totalIops : Math.round(totalDisk * 14_000),
    totalWorkloads:
      telemetry.totalWorkloads > 0 ? telemetry.totalWorkloads : Math.max(0, model.nodes.length - 3),
  };
}

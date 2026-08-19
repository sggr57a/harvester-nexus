import type { EnvironmentAcceleratorSummary } from './hardwareAddOn';
import type { EnvironmentStorageIops } from './storageIops';

/**
 * A metric the node could not measure. The BFF sends `null` rather than a
 * placeholder number, so `0` always means "measured zero" and never
 * "no data" — the two must stay distinguishable in the UI.
 */
export type MaybeMetric = number | null;

/** JSON payload from GET /api/v1/telemetry/environment */
export interface EnvironmentTelemetryPayload {
  totalWorkloads: number;
  totalIops: MaybeMetric;
  ingressMbps: MaybeMetric;
  egressMbps: MaybeMetric;
  cpuPercent: MaybeMetric;
  ramPercent: MaybeMetric;
  watts: MaybeMetric;
  activeMigrations: number;
  openCves: MaybeMetric;
  trustScore: MaybeMetric;
  tick: number;
  source: 'harvester' | 'metrics-server' | 'kube-api' | 'mixed';
  clusterReady: boolean;
  monitoringEnabled: boolean;
  nodeCount: number;
  podCount: number;
  vmCount: number;
  /** Per-metric provenance, e.g. `{ cpu: 'metrics-server', watts: 'unavailable' }`. */
  metricSources?: Record<string, string>;
  /** Allowlisted FPGA / GPU / NPU / TPU pulse collected on the same tick as CPU / RAM. */
  accelerators?: EnvironmentAcceleratorSummary;
  /** Per-disk IOPS / throughput from /proc/diskstats on the same tick as CPU / RAM. */
  storageIops?: EnvironmentStorageIops;
}

export interface LiveHealthPayload {
  live: boolean;
  clusterReady: boolean;
  monitoringEnabled: boolean;
  message?: string;
}

export interface ApplyManifestResult {
  success: boolean;
  error?: string | null;
  output?: string;
  dryRun?: boolean;
}

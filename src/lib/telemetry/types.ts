/** JSON payload from GET /api/v1/telemetry/environment */
export interface EnvironmentTelemetryPayload {
  totalWorkloads: number;
  totalIops: number;
  ingressMbps: number;
  egressMbps: number;
  cpuPercent: number;
  ramPercent: number;
  watts: number;
  activeMigrations: number;
  openCves: number;
  trustScore: number;
  tick: number;
  source: 'harvester' | 'metrics-server' | 'mixed';
  clusterReady: boolean;
  monitoringEnabled: boolean;
  nodeCount: number;
  podCount: number;
  vmCount: number;
}

export interface LiveHealthPayload {
  live: boolean;
  clusterReady: boolean;
  monitoringEnabled: boolean;
  message?: string;
}

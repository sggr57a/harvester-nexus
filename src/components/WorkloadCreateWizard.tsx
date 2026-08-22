import { useMemo } from 'react';
import {
  buildDefaultWorkloadCreateConfig,
  buildPolyComputeDeployCommands,
  buildWorkloadApplyManifest,
  type PolyComputeWorkloadKind,
  type WorkloadCreateConfig,
  workloadCreateLabel,
  workloadKindLabel,
} from '../lib/deploySimulation';
import { DeployActionBar } from './DeployActionBar';
import type { DeployPhase, DeployResult } from '../lib/deploySimulation';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

interface WorkloadCreateWizardProps {
  config: WorkloadCreateConfig;
  dataSource?: TelemetryDataSource;
  onChange: (config: WorkloadCreateConfig) => void;
  deploying?: boolean;
  currentPhase?: DeployPhase | null;
  phaseIndex?: number;
  phaseCount?: number;
  deployResult?: DeployResult | null;
  onDeploy: () => void;
  onCancel: () => void;
}

const kindOptions: PolyComputeWorkloadKind[] = ['kubevirt-vm', 'incus-lxc', 'k8s-pod'];

export function WorkloadCreateWizard({
  config,
  dataSource,
  onChange,
  deploying,
  currentPhase,
  phaseIndex,
  phaseCount,
  deployResult,
  onDeploy,
  onCancel,
}: WorkloadCreateWizardProps) {
  const manifest = useMemo(
    () => buildWorkloadApplyManifest(config, { live: dataSource === 'live' }),
    [config, dataSource],
  );
  const commands = useMemo(() => buildPolyComputeDeployCommands(config), [config]);

  const setKind = (kind: PolyComputeWorkloadKind) => {
    onChange({ ...buildDefaultWorkloadCreateConfig(kind), ...config, kind });
  };

  return (
    <section className="workload-create-wizard hud-panel" aria-label="Create workload wizard">
      <div className="hud-panel-title">
        <span>CREATE // POLY-COMPUTE</span>
        <strong>{workloadKindLabel(config.kind)}</strong>
      </div>

      <header className="workload-create-header">
        <h2>Create {workloadKindLabel(config.kind).toLowerCase()}</h2>
        <p>Configure a KubeVirt VM, Incus LXC container (scaffold), or native Kubernetes pod, then deploy to the cluster.</p>
      </header>

      <nav className="workload-kind-rail" aria-label="Workload type">
        {kindOptions.map((kind) => (
          <button
            key={kind}
            type="button"
            className={config.kind === kind ? 'is-active' : ''}
            onClick={() => setKind(kind)}
            disabled={deploying}
          >
            {workloadKindLabel(kind)}
          </button>
        ))}
      </nav>

      <div className="workload-create-grid">
        <div className="workload-create-form">
          <div className="grid-2">
            <label>
              Name
              <input
                value={config.name}
                onChange={(event) => onChange({ ...config, name: event.target.value })}
                disabled={deploying}
              />
            </label>
            <label>
              Namespace
              <input
                value={config.namespace}
                onChange={(event) => onChange({ ...config, namespace: event.target.value })}
                disabled={deploying}
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              CPU cores
              <input
                type="number"
                min={1}
                max={128}
                value={config.cpuCores}
                onChange={(event) => onChange({ ...config, cpuCores: Number(event.target.value) || 1 })}
                disabled={deploying}
              />
            </label>
            <label>
              Memory (GiB)
              <input
                type="number"
                min={1}
                max={512}
                value={config.memoryGiB}
                onChange={(event) => onChange({ ...config, memoryGiB: Number(event.target.value) || 1 })}
                disabled={deploying}
              />
            </label>
          </div>
          <label>
            Image
            <input
              value={config.image}
              onChange={(event) => onChange({ ...config, image: event.target.value })}
              disabled={deploying}
            />
          </label>
          {config.kind !== 'k8s-pod' && (
            <label>
              Host affinity
              <select
                value={config.hostAffinity}
                onChange={(event) => onChange({ ...config, hostAffinity: event.target.value })}
                disabled={deploying}
              >
                <option value="any">Any node</option>
                <option value="nexus-node-01">nexus-node-01</option>
                <option value="nexus-node-02">nexus-node-02</option>
                <option value="nexus-node-03">nexus-node-03</option>
              </select>
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.enableHa}
              onChange={(event) => onChange({ ...config, enableHa: event.target.checked })}
              disabled={deploying}
            />
            Enable HA restart policy
          </label>
        </div>

        <div className="workload-create-preview">
          <div className="cluster-command-ribbon">
            {commands.map((command) => (
              <span key={command}>{command}</span>
            ))}
          </div>
          <pre>{manifest}</pre>
        </div>
      </div>

      <DeployActionBar
        primaryLabel={workloadCreateLabel(config.kind)}
        secondaryLabel="Cancel"
        disabled={!config.name.trim() || !config.namespace.trim() || !config.image.trim()}
        disabledReason="Name, namespace, and image are required."
        deploying={deploying}
        currentPhase={currentPhase}
        phaseIndex={phaseIndex}
        phaseCount={phaseCount}
        result={deployResult}
        onDeploy={onDeploy}
        onSecondary={onCancel}
      />
    </section>
  );
}

export { buildDefaultWorkloadCreateConfig };

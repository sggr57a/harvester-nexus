import { useMemo, useState } from 'react';
import {
  ALL_NETWORK_TASK_GROUPS,
  buildDefaultNetworkProvisionConfig,
  buildNetworkProvisionManifest,
  networkProvisionCommands,
  networkProvisionTaskLabel,
  type NetworkProvisionConfig,
  type NetworkProvisionTask,
} from '../lib/networkProvisioning';
import { applyNetworkBundle } from '../lib/networkClient';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

interface NetworkProvisionWizardProps {
  dataSource?: TelemetryDataSource;
  onClose?: () => void;
  onApplied?: () => void;
}

const TASK_OPTIONS: { group: string; tasks: NetworkProvisionTask[] }[] = [
  { group: 'Fabric & bridges', tasks: [...ALL_NETWORK_TASK_GROUPS.fabric] },
  { group: 'VLAN & isolation', tasks: [...ALL_NETWORK_TASK_GROUPS.segmentation] },
  { group: 'Overlays & SDN', tasks: [...ALL_NETWORK_TASK_GROUPS.overlay] },
  { group: 'Passthrough', tasks: [...ALL_NETWORK_TASK_GROUPS.passthrough] },
  { group: 'Policy & tenants', tasks: [...ALL_NETWORK_TASK_GROUPS.policy] },
  { group: 'Open vSwitch', tasks: [...ALL_NETWORK_TASK_GROUPS.ovs] },
];

export function NetworkProvisionWizard({ dataSource, onClose, onApplied }: NetworkProvisionWizardProps) {
  const [config, setConfig] = useState<NetworkProvisionConfig>(() => buildDefaultNetworkProvisionConfig('virtual-bridge'));
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; live: boolean } | null>(null);

  const isLive = dataSource === 'live';
  const manifestYaml = useMemo(() => buildNetworkProvisionManifest(config, { live: isLive }), [config, isLive]);
  const commands = useMemo(() => networkProvisionCommands(config), [config]);

  const setTask = (task: NetworkProvisionTask) => {
    setConfig(buildDefaultNetworkProvisionConfig(task));
    setResult(null);
  };

  const handleApply = async () => {
    setApplying(true);
    setResult(null);
    try {
      const ovsCmds = commands.filter((c) => c.startsWith('ovs-'));
      const k8sCmds = commands.filter((c) => !c.startsWith('ovs-'));
      const applyResult = await applyNetworkBundle(manifestYaml, ovsCmds, k8sCmds);
      setResult(applyResult);
      if (applyResult.success) onApplied?.();
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="wizard-shell network-provision-wizard" aria-label="Network provision wizard">
      <header className="wizard-header">
        <h2>Network provisioning</h2>
        <p>
          {isLive
            ? 'Create virtual bridges, OVS switches, VLAN port groups, SDN zones, passthrough networks, and zero-trust policies on your cluster.'
            : 'Demo mode — manifests are generated locally. Switch telemetry to Live on a Harvester node to apply.'}
        </p>
        {onClose && (
          <button type="button" className="ghost-btn" onClick={onClose}>
            Back to Networking
          </button>
        )}
      </header>

      <nav className="network-task-rail" aria-label="Network task types">
        {TASK_OPTIONS.map(({ group, tasks }) => (
          <div key={group} className="network-task-group">
            <span>{group}</span>
            <div className="network-task-buttons">
              {tasks.map((task) => (
                <button
                  key={task}
                  type="button"
                  className={config.task === task ? 'is-active' : ''}
                  onClick={() => setTask(task)}
                  disabled={applying}
                >
                  {networkProvisionTaskLabel(task)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="network-provision-grid">
        <div className="network-provision-form">
          <h3>{networkProvisionTaskLabel(config.task)}</h3>
          {(config.task === 'virtual-switch' || config.task === 'virtual-bridge') && (
            <>
              <label>
                Backend
                <select
                  value={config.virtualSwitch.backend}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      virtualSwitch: {
                        ...config.virtualSwitch,
                        backend: e.target.value as typeof config.virtualSwitch.backend,
                      },
                    })
                  }
                >
                  <option value="openvswitch">Open vSwitch</option>
                  <option value="harvester-bridge">Harvester ClusterNetwork</option>
                </select>
              </label>
              <label>
                Name
                <input
                  value={config.virtualSwitch.name}
                  onChange={(e) => setConfig({ ...config, virtualSwitch: { ...config.virtualSwitch, name: e.target.value } })}
                />
              </label>
            </>
          )}
          {(config.task === 'vlan' || config.task === 'port-group') && (
            <>
              <label>VLAN ID<input type="number" value={config.task === 'port-group' ? config.hypervisor.portGroup.vlanId : config.vlan.vlanId} onChange={(e) => {
                const vlanId = Number(e.target.value) || 1;
                if (config.task === 'port-group') {
                  setConfig({ ...config, hypervisor: { ...config.hypervisor, portGroup: { ...config.hypervisor.portGroup, vlanId } } });
                } else {
                  setConfig({ ...config, vlan: { ...config.vlan, vlanId } });
                }
              }} /></label>
              <label>CIDR<input value={config.task === 'port-group' ? config.hypervisor.portGroup.cidr : config.vlan.cidr} onChange={(e) => {
                if (config.task === 'port-group') {
                  setConfig({ ...config, hypervisor: { ...config.hypervisor, portGroup: { ...config.hypervisor.portGroup, cidr: e.target.value } } });
                } else {
                  setConfig({ ...config, vlan: { ...config.vlan, cidr: e.target.value } });
                }
              }} /></label>
            </>
          )}
          {config.task.startsWith('ovs-') && (
            <label>
              OVS bridge
              <input
                value={config.ovs.bridge.name}
                onChange={(e) => setConfig({ ...config, ovs: { ...config.ovs, bridge: { ...config.ovs.bridge, name: e.target.value } } })}
              />
            </label>
          )}
          {config.task === 'tenant' && (
            <label>
              Tenant namespace
              <input
                value={config.tenant.namespace}
                onChange={(e) => setConfig({ ...config, tenant: { ...config.tenant, namespace: e.target.value, tenantName: e.target.value } })}
              />
            </label>
          )}
        </div>
        <div className="network-provision-preview">
          <div className="cluster-command-ribbon">
            {commands.map((command) => (
              <span key={command}>{command}</span>
            ))}
          </div>
          <pre>{manifestYaml}</pre>
        </div>
      </div>

      <footer className="deploy-action-bar">
        <div className="deploy-action-copy">
          {result ? (
            <>
              <strong className={result.success ? 'deploy-success' : 'deploy-error'}>
                {result.success ? 'Applied' : 'Failed'}
              </strong>
              <span>{result.message}</span>
            </>
          ) : (
            <>
              <strong>Ready to apply</strong>
              <span>Review manifest and commands, then apply to the cluster.</span>
            </>
          )}
        </div>
        <div className="deploy-action-buttons">
          <button type="button" className="deploy-primary" onClick={() => void handleApply()} disabled={applying}>
            {applying ? 'Applying…' : 'Apply to cluster'}
          </button>
        </div>
      </footer>
    </section>
  );
}

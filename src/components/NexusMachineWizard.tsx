import { useState, type ReactNode } from 'react';
import { HarvesterMachineConfig, HarvesterMachineInstallPlan } from '../lib/harvesterMachineWizard';

export type MachineWizardTab = 'platform' | 'manifest' | 'review';

interface NexusMachineWizardProps {
  config: HarvesterMachineConfig;
  plan: HarvesterMachineInstallPlan;
  onChange: (config: HarvesterMachineConfig) => void;
  /** When provided, renders the Manifest Generator wizard inside the
   * Manifest tab of the Machine Wizard. The Machine Wizard becomes the
   * single entry point that can drive both bare-metal install + workload
   * manifest generation.
   */
  manifestWizardSlot?: ReactNode;
  /** Optional review surface (manifest preview / diff / dry run) shown in
   * the third tab so users can verify the combined plan before applying.
   */
  reviewSlot?: ReactNode;
  /** Initial active tab (defaults to platform). */
  initialTab?: MachineWizardTab;
}

function updateListValue(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function NexusMachineWizard({
  config,
  plan,
  onChange,
  manifestWizardSlot,
  reviewSlot,
  initialTab = 'platform',
}: NexusMachineWizardProps) {
  const [tab, setTab] = useState<MachineWizardTab>(initialTab);

  return (
    <section className="machine-wizard hud-panel" aria-label="Nexus new machine Harvester wizard">
      <div className="hud-panel-title machine-wizard-title">
        <span>New machine wizard</span>
        <strong>
          {plan.validationIssues.length === 0
            ? `platform install ready · ${tab === 'platform' ? 'install' : tab === 'manifest' ? 'manifest' : 'review'} active`
            : 'machine fields required'}
        </strong>
      </div>

      <nav className="machine-wizard-tabs" aria-label="Machine wizard sections">
        <button type="button" className={tab === 'platform' ? 'is-active' : ''} onClick={() => setTab('platform')}>
          <span>01</span>
          Platform install
        </button>
        <button
          type="button"
          className={tab === 'manifest' ? 'is-active' : ''}
          onClick={() => setTab('manifest')}
          disabled={!manifestWizardSlot}
          title={manifestWizardSlot ? 'Generate Kubernetes manifests' : 'Manifest wizard not connected'}
        >
          <span>02</span>
          Manifest generator
        </button>
        <button
          type="button"
          className={tab === 'review' ? 'is-active' : ''}
          onClick={() => setTab('review')}
          disabled={!reviewSlot}
          title={reviewSlot ? 'Review apply plan' : 'No review surface connected'}
        >
          <span>03</span>
          Review &amp; apply
        </button>
      </nav>

      {tab === 'manifest' && manifestWizardSlot && (
        <div className="machine-wizard-embedded" aria-label="Embedded manifest wizard">
          <p className="machine-wizard-embed-note">
            The full Manifest Wizard is embedded here as an option of the Machine Wizard. Bare-metal install
            and workload manifest generation can be driven from the same surface.
          </p>
          {manifestWizardSlot}
        </div>
      )}

      {tab === 'review' && reviewSlot && (
        <div className="machine-wizard-embedded" aria-label="Combined review surface">
          {reviewSlot}
        </div>
      )}

      {tab === 'platform' && (
      <div className="machine-wizard-grid">
        <div className="machine-wizard-form">
          <label>
            Install mode
            <select value={config.installMode} onChange={(event) => onChange({ ...config, installMode: event.target.value as HarvesterMachineConfig['installMode'] })}>
              <option value="create">Create new Nexus cluster</option>
              <option value="join">Join existing Nexus cluster</option>
              <option value="binaries">Install binaries only</option>
            </select>
          </label>
          <div className="grid-2">
            <label>
              Host name
              <input value={config.hostName} onChange={(event) => onChange({ ...config, hostName: event.target.value })} />
            </label>
            <label>
              Management NIC
              <input value={config.managementInterface} onChange={(event) => onChange({ ...config, managementInterface: event.target.value })} />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Install disk
              <input value={config.installDisk} onChange={(event) => onChange({ ...config, installDisk: event.target.value })} />
            </label>
            <label>
              Data disk
              <input value={config.dataDisk} onChange={(event) => onChange({ ...config, dataDisk: event.target.value })} />
            </label>
          </div>
          <div className="grid-2">
            <label>
              VIP mode
              <select value={config.vipMode} onChange={(event) => onChange({ ...config, vipMode: event.target.value as HarvesterMachineConfig['vipMode'] })}>
                <option value="static">Static VIP</option>
                <option value="dhcp">DHCP VIP</option>
              </select>
            </label>
            <label>
              Virtual IP
              <input value={config.virtualIp} onChange={(event) => onChange({ ...config, virtualIp: event.target.value })} />
            </label>
          </div>
          <label>
            Cluster token
            <input value={config.clusterToken} onChange={(event) => onChange({ ...config, clusterToken: event.target.value })} />
          </label>
          {config.installMode === 'join' && (
            <label>
              Existing cluster URL
              <input value={config.serverUrl || ''} onChange={(event) => onChange({ ...config, serverUrl: event.target.value })} placeholder="https://10.10.40.20:443" />
            </label>
          )}
          <div className="grid-2">
            <label>
              DNS servers
              <input value={config.dnsServers.join(', ')} onChange={(event) => onChange({ ...config, dnsServers: updateListValue(event.target.value) })} />
            </label>
            <label>
              NTP servers
              <input value={config.ntpServers.join(', ')} onChange={(event) => onChange({ ...config, ntpServers: updateListValue(event.target.value) })} />
            </label>
          </div>
          <div className="machine-feature-grid">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.liveMigration.enabled}
                onChange={(event) => onChange({ ...config, liveMigration: { ...config.liveMigration, enabled: event.target.checked } })}
              />
              vMotion-style live migration for LXC, Docker, and VMs
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.nvmeOverRdma.enabled}
                onChange={(event) => onChange({ ...config, nvmeOverRdma: { ...config.nvmeOverRdma, enabled: event.target.checked } })}
              />
              Built-in NVMe over RDMA storage fabric
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.memoryTiering.enabled}
                onChange={(event) => onChange({ ...config, memoryTiering: { ...config.memoryTiering, enabled: event.target.checked } })}
              />
              Install-time memory tiering
            </label>
          </div>
          <div className="grid-3">
            <label>
              RDMA fabric NIC
              <input value={config.nvmeOverRdma.fabricInterface} onChange={(event) => onChange({ ...config, nvmeOverRdma: { ...config.nvmeOverRdma, fabricInterface: event.target.value } })} />
            </label>
            <label>
              Memory tier mode
              <select value={config.memoryTiering.mode} onChange={(event) => onChange({ ...config, memoryTiering: { ...config.memoryTiering, mode: event.target.value as HarvesterMachineConfig['memoryTiering']['mode'] } })}>
                <option value="nvme">NVMe tier</option>
                <option value="phase-change">Phase-change tier</option>
              </select>
            </label>
            <label>
              Tier device
              <input value={config.memoryTiering.device} onChange={(event) => onChange({ ...config, memoryTiering: { ...config.memoryTiering, device: event.target.value } })} />
            </label>
          </div>

          <fieldset className="wizard-fieldset">
            <legend>Poly-compute engine</legend>
            <div className="machine-feature-grid">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.polyCompute.kubevirt}
                  onChange={(event) => onChange({ ...config, polyCompute: { ...config.polyCompute, kubevirt: event.target.checked } })}
                />
                KubeVirt VMs (full kernel independence, live migration)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.polyCompute.incusLxc}
                  onChange={(event) => onChange({ ...config, polyCompute: { ...config.polyCompute, incusLxc: event.target.checked } })}
                />
                Incus / LXC system containers (bare-metal speed)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.polyCompute.k8sPods}
                  onChange={(event) => onChange({ ...config, polyCompute: { ...config.polyCompute, k8sPods: event.target.checked } })}
                />
                Native K8s pods (cgroups v2 + Cilium eBPF)
              </label>
            </div>
          </fieldset>

          <fieldset className="wizard-fieldset">
            <legend>Hardware acceleration</legend>
            <div className="machine-feature-grid">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.spdk}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, spdk: event.target.checked } })}
                />
                SPDK userspace NVMe-oF queues
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.dpdk}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, dpdk: event.target.checked } })}
                />
                DPDK ring buffers
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.vhostUser}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, vhostUser: event.target.checked } })}
                />
                vhost-user network fast path
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.numaPinning}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, numaPinning: event.target.checked } })}
                />
                Topology-aware NUMA pinning
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.gpuPassthrough}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, gpuPassthrough: event.target.checked } })}
                />
                GPU / FPGA pass-through (vfio-pci)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.hardwareAcceleration.nestedVirt}
                  onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, nestedVirt: event.target.checked } })}
                />
                Nested virtualization (AI / ML training)
              </label>
            </div>
            <label>
              1 GiB hugepages reserved per node
              <input
                type="number"
                min={0}
                max={512}
                step={1}
                value={config.hardwareAcceleration.hugepages1G}
                onChange={(event) => onChange({ ...config, hardwareAcceleration: { ...config.hardwareAcceleration, hugepages1G: Number(event.target.value) || 0 } })}
              />
            </label>
          </fieldset>
        </div>

        <div className="machine-plan">
          <div className="machine-steps">
            {plan.steps.map((step, index) => (
              <div className={`machine-step ${step.status}`} key={step.id} style={{ animationDelay: `${index * 90}ms` }}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="machine-source-card">
            <span>Harvester source root</span>
            <strong>{plan.sourceRoot}</strong>
            <small>Imported platform source is carried in this Nexus repository, not mounted as an add-on.</small>
          </div>
        </div>
      </div>
      )}

      {tab === 'platform' && plan.validationIssues.length > 0 && (
        <div className="machine-issues" role="alert">
          {plan.validationIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}

      {tab === 'platform' && (
        <div className="machine-config-preview">
          <div className="cluster-command-ribbon">
            {plan.bootParameters.map((parameter) => (
              <span key={parameter}>{parameter}</span>
            ))}
          </div>
          <pre>{plan.configYaml}</pre>
        </div>
      )}
    </section>
  );
}

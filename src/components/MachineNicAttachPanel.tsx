import { useState } from 'react';
import type { MachineRow, NetworkingDashboard } from '../lib/dashboards';
import {
  attachableNetworksForSource,
  nextInterfaceName,
  type AttachableNetwork,
  type VirtualNicAttachRequest,
} from '../lib/machineNetworkAttach';
import { attachMachineNetwork } from '../lib/networkClient';
import { recordVirtualNicAttach } from '../lib/machineNetworkStore';
import { HYPERVISOR_NIC_MODELS, type HypervisorNicModel } from '../lib/hypervisorNetworking';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

interface MachineNicAttachPanelProps {
  machine: MachineRow;
  dataSource?: TelemetryDataSource;
  networkingDashboard?: NetworkingDashboard;
  attachableNetworks?: AttachableNetwork[];
  onAttached?: () => void;
}

export function MachineNicAttachPanel({
  machine,
  dataSource,
  networkingDashboard,
  attachableNetworks: attachableNetworksOverride,
  onAttached,
}: MachineNicAttachPanelProps) {
  const attachableNetworks =
    attachableNetworksOverride ?? attachableNetworksForSource(dataSource, networkingDashboard);
  const existingNames = machine.networks?.map((n) => n.name) ?? [];
  const [interfaceName, setInterfaceName] = useState(() => nextInterfaceName(existingNames));
  const [networkId, setNetworkId] = useState(attachableNetworks[0]?.id ?? '');
  const [nicModel, setNicModel] = useState<HypervisorNicModel>('virtio');
  const [attaching, setAttaching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (machine.kind === 'node') return null;

  const selected = attachableNetworks.find((n) => n.id === networkId) ?? attachableNetworks[0];
  const canAttach = machine.namespace && selected && interfaceName.trim() && attachableNetworks.length > 0;

  const handleAttach = async () => {
    if (!canAttach || !selected) return;
    setAttaching(true);
    setMessage(null);
    const request: VirtualNicAttachRequest = {
      machineId: machine.id,
      machineName: machine.name,
      namespace: machine.namespace!,
      kind: machine.kind,
      interfaceName: interfaceName.trim(),
      networkAttachment: selected.nadRef,
      ovsBridge: selected.ovsBridge,
      vlanId: selected.vlanId,
      model: nicModel,
    };
    const result = await attachMachineNetwork(request);
    if (result.success && !result.live) {
      recordVirtualNicAttach(request, selected.networkType);
    }
    setMessage(result.message);
    setAttaching(false);
    if (result.success) {
      setInterfaceName(nextInterfaceName([...existingNames, interfaceName]));
      onAttached?.();
    }
  };

  return (
    <section className="machine-nic-attach" aria-label="Attach virtual NIC">
      <h4>Add virtual NIC</h4>
      <p className="machine-detail-muted">
        Attach a secondary vNIC to this {machine.kind} — virtual bridge, OVS port group, VLAN, macvtap, SR-IOV, or overlay network.
      </p>
      {attachableNetworks.length === 0 ? (
        <p className="machine-detail-muted">
          {dataSource === 'live'
            ? 'No attachable networks in the cluster yet. Use the network wizard to create NADs, port groups, or overlays.'
            : 'No attachable networks configured.'}
        </p>
      ) : (
      <div className="machine-nic-attach-grid">
        <label>
          Interface
          <input value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)} disabled={attaching} />
        </label>
        <label>
          Network
          <select value={networkId} onChange={(e) => setNetworkId(e.target.value)} disabled={attaching}>
            {attachableNetworks.map((net) => (
              <option key={net.id} value={net.id}>
                {net.name}
              </option>
            ))}
          </select>
        </label>
        {machine.kind === 'vm' && (
          <label>
            vNIC model
            <select value={nicModel} onChange={(e) => setNicModel(e.target.value as HypervisorNicModel)} disabled={attaching}>
              {HYPERVISOR_NIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      )}
      <button type="button" className="machines-create-btn" onClick={() => void handleAttach()} disabled={!canAttach || attaching}>
        {attaching ? 'Attaching…' : 'Attach virtual NIC'}
      </button>
      {message && <p className="machine-nic-attach-result">{message}</p>}
      {dataSource === 'live' && (
        <small className="machine-detail-muted">Live attach patches the VM or pod Multus annotation via cluster API.</small>
      )}
    </section>
  );
}

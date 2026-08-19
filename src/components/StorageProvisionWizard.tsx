import { useMemo, useState } from 'react';
import { ApplicationConfig, defaultConfig } from '../types';
import { Wizard } from './Wizard';
import { StorageInstaller } from '../lib/storageInstaller';
import { buildCsiTemplatePreview } from '../lib/clusterWorkflow';
import {
  generateStandalonePVCManifest,
  generateStaticPVManifest,
} from '../lib/manifestGenerator';
import { applyOrSimulateManifest } from '../lib/clusterApply';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

export type StorageProvisionTask = 'backend' | 'pvc' | 'pv';

interface StorageProvisionWizardProps {
  dataSource?: TelemetryDataSource;
  onClose?: () => void;
}

export function StorageProvisionWizard({ dataSource, onClose }: StorageProvisionWizardProps) {
  const [task, setTask] = useState<StorageProvisionTask>('pvc');
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<ApplicationConfig>(() => ({
    ...defaultConfig,
    appName: 'data-vol',
    namespace: 'default',
    storage: { ...defaultConfig.storage, storageClass: 'longhorn', storageSize: '10Gi' },
  }));
  const [pvcName, setPvcName] = useState('data-vol');
  const [pvName, setPvName] = useState('pv-data-vol');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; live: boolean } | null>(null);

  const isLive = dataSource === 'live';

  const manifestYaml = useMemo(() => {
    if (task === 'backend') {
      const csi = buildCsiTemplatePreview(config.storage);
      return csi.templates.map((t) => t.yaml).join('\n---\n');
    }
    if (task === 'pv') {
      return generateStaticPVManifest({
        name: pvName,
        storageClass: config.storage.storageClass,
        storageSize: config.storage.storageSize,
        accessMode: config.storage.accessMode,
        hostPath: config.storage.storageType === 'local' ? '/var/lib/longhorn' : undefined,
        nfsServer: config.storage.nfsServer,
        nfsPath: config.storage.nfsPath,
      });
    }
    return generateStandalonePVCManifest({
      name: pvcName,
      namespace: config.namespace,
      storageClass: config.storage.storageClass,
      storageSize: config.storage.storageSize,
      accessMode: config.storage.accessMode,
    });
  }, [task, config, pvcName, pvName]);

  const handleApply = async () => {
    setApplying(true);
    setResult(null);
    try {
      let commands: string[] = [];
      if (task === 'backend') {
        const install = await StorageInstaller.installStorage(config.storage);
        commands = install.commands;
        const combined = install.manifests.join('\n---\n');
        const applyResult = await applyOrSimulateManifest(combined || manifestYaml, commands);
        setResult(applyResult);
        return;
      }
      const applyResult = await applyOrSimulateManifest(
        manifestYaml,
        [`kubectl apply -f - <<'EOF'\n${manifestYaml}\nEOF`],
      );
      setResult(applyResult);
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="wizard-shell storage-provision-wizard" aria-label="Storage provision wizard">
      <header className="wizard-header">
        <h2>Storage configuration</h2>
        <p>
          {isLive
            ? 'Provision CSI backends, PersistentVolumes, and PVCs on your Harvester cluster via kubectl.'
            : 'Demo mode — manifests are generated locally. Switch telemetry to Live on a Harvester node to apply.'}
        </p>
        {onClose && (
          <button type="button" className="ghost-btn" onClick={onClose}>
            Back to Storage
          </button>
        )}
      </header>

      {step === 0 && (
        <div className="wizard-panel">
          <h3>What do you want to configure?</h3>
          <div className="storage-grid">
            {(
              [
                ['backend', 'Install storage backend', 'Deploy CSI driver / StorageClass (NFS, Ceph, Longhorn, iSCSI, …)'],
                ['pvc', 'Create PVC', 'PersistentVolumeClaim in a tenant namespace'],
                ['pv', 'Create PV', 'Static PersistentVolume (local path or NFS)'],
              ] as const
            ).map(([id, title, detail]) => (
              <button
                key={id}
                type="button"
                className={task === id ? 'storage-option active' : 'storage-option'}
                onClick={() => setTask(id)}
              >
                <strong>{title}</strong>
                <span>{detail}</span>
              </button>
            ))}
          </div>
          {task === 'pvc' && (
            <div className="grid-2">
              <label>
                PVC name
                <input value={pvcName} onChange={(e) => setPvcName(e.target.value)} />
              </label>
              <label>
                Namespace
                <input
                  value={config.namespace}
                  onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                />
              </label>
            </div>
          )}
          {task === 'pv' && (
            <label>
              PV name
              <input value={pvName} onChange={(e) => setPvName(e.target.value)} />
            </label>
          )}
          <div className="wizard-actions">
            <button type="button" className="primary-btn" onClick={() => setStep(1)}>
              Next — protocol settings
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <>
          <Wizard
            currentStep={2}
            config={config}
            onChange={setConfig}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        </>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          <h3>Review manifest</h3>
          <pre className="yaml-preview">{manifestYaml}</pre>
          {result && (
            <p className={result.success ? 'deploy-success' : 'deploy-error'}>
              {result.message}
              {result.live ? ' (applied on cluster)' : ' (local preview only)'}
            </p>
          )}
          <div className="wizard-actions">
            <button type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="primary-btn" disabled={applying} onClick={() => void handleApply()}>
              {applying ? 'Applying…' : isLive ? 'Apply to cluster' : 'Validate manifest'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

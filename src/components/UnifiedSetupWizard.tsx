import type { ApplicationConfig } from '../types';
import type { HarvesterMachineConfig, HarvesterMachineInstallPlan } from '../lib/harvesterMachineWizard';
import { NexusMachineWizard } from './NexusMachineWizard';
import { Wizard } from './Wizard';

interface UnifiedSetupWizardProps {
  machineConfig: HarvesterMachineConfig;
  machinePlan: HarvesterMachineInstallPlan;
  onMachineChange: (config: HarvesterMachineConfig) => void;
  manifestConfig: ApplicationConfig;
  onManifestChange: (config: ApplicationConfig) => void;
  manifestStep: number;
  onManifestStepChange: (step: number) => void;
  includeManifestSetup: boolean;
  onIncludeManifestSetupChange: (include: boolean) => void;
}

const manifestSteps = ['Workload', 'Storage', 'Networking', 'Security', 'Monitoring', 'GitOps', 'Review'];

export function UnifiedSetupWizard({
  machineConfig,
  machinePlan,
  onMachineChange,
  manifestConfig,
  onManifestChange,
  manifestStep,
  onManifestStepChange,
  includeManifestSetup,
  onIncludeManifestSetupChange,
}: UnifiedSetupWizardProps) {
  return (
    <section className="setup-wizard-shell" aria-label="Unified Nexus setup wizard">
      <div className="setup-geometry-backdrop" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="setup-wizard-hero">
        <div>
          <span className="hud-kicker">SETUP // ONE WIZARD</span>
          <h2>Platform install with optional manifest setup</h2>
          <p>
            Provision the Nexus host first, then optionally fold the Kubernetes manifest wizard into the same transparent control surface.
          </p>
        </div>
        <div className="setup-wizard-status">
          <strong>{machinePlan.validationIssues.length === 0 ? 'Ready' : `${machinePlan.validationIssues.length} checks`}</strong>
          <span>machine plan</span>
        </div>
      </header>

      <div className="setup-phase-grid" aria-label="Setup phases">
        <article>
          <span>01</span>
          <strong>Machine foundation</strong>
          <p>Install mode, disks, VIP, poly-compute, acceleration, and boot parameters.</p>
        </article>
        <article className={includeManifestSetup ? 'is-active' : ''}>
          <span>02</span>
          <strong>Optional manifest setup</strong>
          <p>Application, storage, networking, security, monitoring, GitOps, and review.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Generated previews</strong>
          <p>Machine YAML and Kubernetes manifests remain visible for practical review.</p>
        </article>
      </div>

      <NexusMachineWizard config={machineConfig} plan={machinePlan} onChange={onMachineChange} />

      <section className="manifest-setup-embed" aria-label="Optional manifest setup wizard">
        <div className="manifest-setup-header">
          <div>
            <span className="hud-kicker">OPTIONAL // MANIFEST WIZARD</span>
            <h3>Application manifest setup</h3>
            <p>Turn this on when the platform setup should also prepare workload manifests.</p>
          </div>
          <label className="manifest-setup-toggle">
            <input
              type="checkbox"
              checked={includeManifestSetup}
              onChange={(event) => onIncludeManifestSetupChange(event.target.checked)}
            />
            <span>
              <b>{includeManifestSetup ? 'Included' : 'Optional'}</b>
              manifest setup
            </span>
          </label>
        </div>

        {includeManifestSetup ? (
          <>
            <nav className="manifest-step-rail" aria-label="Manifest setup steps">
              {manifestSteps.map((label, index) => {
                const step = index + 1;
                return (
                  <button
                    className={manifestStep === step ? 'is-active' : ''}
                    key={label}
                    type="button"
                    onClick={() => onManifestStepChange(step)}
                  >
                    <span>{String(step).padStart(2, '0')}</span>
                    {label}
                  </button>
                );
              })}
            </nav>
            <Wizard
              currentStep={manifestStep}
              config={manifestConfig}
              onChange={onManifestChange}
              onBack={() => onManifestStepChange(Math.max(manifestStep - 1, 1))}
              onNext={() => onManifestStepChange(Math.min(manifestStep + 1, manifestSteps.length))}
            />
          </>
        ) : (
          <div className="manifest-setup-placeholder">
            <div className="placeholder-orbit" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div>
              <strong>Manifest wizard is parked</strong>
              <p>Enable it only when workload YAML should be configured during the same platform setup pass.</p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

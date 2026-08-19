import type { ReactNode } from 'react';
import type { ApplicationConfig } from '../types';
import type { DeployPhase, DeployResult } from '../lib/deploySimulation';
import type { HarvesterMachineConfig, HarvesterMachineInstallPlan } from '../lib/harvesterMachineWizard';
import type { ValidationResult } from '../lib/clusterWorkflow';
import { DeployActionBar } from './DeployActionBar';
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
  manifestValidation: ValidationResult;
  onDeployCluster: () => void;
  clusterDeployLabel: string;
  clusterDeployDisabled: boolean;
  clusterDeployDisabledReason?: string;
  clusterDeploying?: boolean;
  clusterDeployPhase?: DeployPhase | null;
  clusterPhaseIndex?: number;
  clusterPhaseCount?: number;
  clusterDeployResult?: DeployResult | null;
  onDeployWorkload: () => void;
  workloadDeployDisabled: boolean;
  workloadDeployDisabledReason?: string;
  workloadDeploying?: boolean;
  workloadDeployPhase?: DeployPhase | null;
  workloadPhaseIndex?: number;
  workloadPhaseCount?: number;
  workloadDeployResult?: DeployResult | null;
  onGoToClusterConsole: () => void;
  reviewSlot: ReactNode;
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
  manifestValidation,
  onDeployCluster,
  clusterDeployLabel,
  clusterDeployDisabled,
  clusterDeployDisabledReason,
  clusterDeploying,
  clusterDeployPhase,
  clusterPhaseIndex,
  clusterPhaseCount,
  clusterDeployResult,
  onDeployWorkload,
  workloadDeployDisabled,
  workloadDeployDisabledReason,
  workloadDeploying,
  workloadDeployPhase,
  workloadPhaseIndex,
  workloadPhaseCount,
  workloadDeployResult,
  onGoToClusterConsole,
  reviewSlot,
}: UnifiedSetupWizardProps) {
  const manifestWizardSlot = (
    <Wizard
      currentStep={manifestStep}
      config={manifestConfig}
      onChange={onManifestChange}
      onBack={() => onManifestStepChange(Math.max(manifestStep - 1, 1))}
      onNext={() => onManifestStepChange(Math.min(manifestStep + 1, manifestSteps.length))}
      onFinish={() => onManifestStepChange(manifestSteps.length)}
    />
  );

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
            Configure the Nexus host, create or join a cluster, optionally prepare workload manifests, then deploy from the review tab.
          </p>
        </div>
        <div className="setup-wizard-status">
          <strong>{machinePlan.validationIssues.length === 0 ? 'Ready' : `${machinePlan.validationIssues.length} checks`}</strong>
          <span>machine plan</span>
        </div>
      </header>

      <div className="setup-phase-grid" aria-label="Setup phases">
        <article className="is-active">
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
          <strong>Review &amp; deploy</strong>
          <p>Use Create cluster or Deploy workload once validation passes.</p>
        </article>
      </div>

      <NexusMachineWizard
        config={machineConfig}
        plan={machinePlan}
        onChange={onMachineChange}
        manifestWizardSlot={includeManifestSetup ? manifestWizardSlot : undefined}
        reviewSlot={reviewSlot}
        onDeployCluster={onDeployCluster}
        clusterDeployLabel={clusterDeployLabel}
        clusterDeployDisabled={clusterDeployDisabled}
        clusterDeployDisabledReason={clusterDeployDisabledReason}
        clusterDeploying={clusterDeploying}
        clusterDeployPhase={clusterDeployPhase}
        clusterPhaseIndex={clusterPhaseIndex}
        clusterPhaseCount={clusterPhaseCount}
        clusterDeployResult={clusterDeployResult}
        onGoToClusterConsole={onGoToClusterConsole}
      />

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
            {manifestWizardSlot}
            <DeployActionBar
              primaryLabel="Deploy workload"
              secondaryLabel={workloadDeployResult?.success ? 'Open Cluster Console' : 'Go to review tab'}
              disabled={workloadDeployDisabled}
              disabledReason={workloadDeployDisabledReason}
              deploying={workloadDeploying}
              currentPhase={workloadDeployPhase}
              phaseIndex={workloadPhaseIndex}
              phaseCount={workloadPhaseCount}
              result={workloadDeployResult}
              onDeploy={onDeployWorkload}
              onSecondary={
                workloadDeployResult?.success
                  ? onGoToClusterConsole
                  : () => onManifestStepChange(manifestSteps.length)
              }
            />
            {!manifestValidation.valid && (
              <div className="machine-issues" role="alert">
                {manifestValidation.issues.map((issue) => (
                  <p key={`${issue.resource}-${issue.message}`}>{issue.severity.toUpperCase()}: {issue.message}</p>
                ))}
              </div>
            )}
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

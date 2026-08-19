import type { DeployPhase, DeployResult } from '../lib/deploySimulation';

interface DeployActionBarProps {
  primaryLabel: string;
  secondaryLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  deploying?: boolean;
  currentPhase?: DeployPhase | null;
  phaseIndex?: number;
  phaseCount?: number;
  result?: DeployResult | null;
  onDeploy: () => void;
  onSecondary?: () => void;
}

export function DeployActionBar({
  primaryLabel,
  secondaryLabel,
  disabled,
  disabledReason,
  deploying,
  currentPhase,
  phaseIndex = 0,
  phaseCount = 0,
  result,
  onDeploy,
  onSecondary,
}: DeployActionBarProps) {
  const progress = phaseCount > 0 ? Math.round(((phaseIndex + (deploying ? 0.5 : 1)) / phaseCount) * 100) : 0;

  return (
    <footer className="deploy-action-bar" aria-label="Deploy actions">
      <div className="deploy-action-copy">
        {deploying && currentPhase ? (
          <>
            <strong>{currentPhase.label}</strong>
            <span>{currentPhase.detail}</span>
          </>
        ) : result?.success ? (
          <>
            <strong className="deploy-success">Deployment complete</strong>
            <span>{result.message}</span>
          </>
        ) : result && !result.success ? (
          <>
            <strong className="deploy-error">Deployment failed</strong>
            <span>{result.message}</span>
          </>
        ) : disabled && disabledReason ? (
          <>
            <strong>Not ready to deploy</strong>
            <span>{disabledReason}</span>
          </>
        ) : (
          <>
            <strong>Ready to apply</strong>
            <span>Review parameters above, then run the simulated deploy action.</span>
          </>
        )}
      </div>

      {(deploying || (phaseCount > 0 && result)) && (
        <div className="deploy-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}

      <div className="deploy-action-buttons">
        {secondaryLabel && onSecondary && (
          <button type="button" className="deploy-secondary" onClick={onSecondary} disabled={deploying}>
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          className="deploy-primary"
          onClick={onDeploy}
          disabled={disabled || deploying}
          title={disabled ? disabledReason : undefined}
        >
          {deploying ? 'Deploying…' : primaryLabel}
        </button>
      </div>
    </footer>
  );
}

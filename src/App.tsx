import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApplicationConfig, defaultConfig, StorageType } from './types';
import { generateManifest } from './lib/manifestGenerator';
import { buildApplyTestRun, buildCsiTemplatePreview, buildLivePreview, buildNexusClusterOperationBundle, buildVClusterPlan, validateKubernetesManifest } from './lib/clusterWorkflow';
import { buildDefaultMachineConfig, buildHarvesterMachineInstallPlan } from './lib/harvesterMachineWizard';
import {
  buildClusterDeployCommands,
  buildDefaultWorkloadCreateConfig,
  buildPolyComputeDeployCommands,
  buildWorkloadDeployCommands,
  buildWorkloadManifest,
  canDeployCluster,
  canDeployWorkload,
  clusterDeployLabel,
  clusterDeployTarget,
  getDeployPhases,
  simulateDeploy,
  type DeployPhase,
  type DeployResult,
  type PolyComputeWorkloadKind,
} from './lib/deploySimulation';
import { isDemoLogin } from './lib/auth';
import { useEnvironmentTelemetry } from './lib/telemetry/useEnvironmentTelemetry';
import { useClusterDashboards } from './lib/telemetry/useClusterDashboards';
import {
  recordClusterDeploy,
  recordPolyComputeDeploy,
  recordWorkloadDeploy,
} from './lib/simulationStore';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from './lib/themes';
import { ClusterIntegrationPanel } from './components/ClusterIntegrationPanel';
import { DeployActionBar } from './components/DeployActionBar';
import { EnvironmentIntelHudView } from './components/dashboards/EnvironmentIntelHudView';
import { ResourceMonitorHudView } from './components/dashboards/ResourceMonitorHudView';
import { EnvironmentTicker, SidebarRouteDecoration } from './components/EnvironmentTicker';
import { LaunchSequence } from './components/LaunchSequence';
import { LoginScreen } from './components/LoginScreen';
import { ThemePicker } from './components/ThemePicker';
import { UnifiedSetupWizard } from './components/UnifiedSetupWizard';
import { WorkloadCreateWizard } from './components/WorkloadCreateWizard';
import { YamlEditor } from './components/YamlEditor';
import {
  AccelerationDashboardView,
  ActivityDashboardView,
  MachinesDashboardView,
  NetworkingDashboardView,
  OperationsDashboardView,
  PolyComputeDashboardView,
  ProcessorMemoryDashboardView,
  StorageDashboardView,
} from './components/dashboards/Dashboards';
import { MissionControlView } from './components/dashboards/MissionControl';
import { TelemetryWaveView } from './components/dashboards/TelemetryWave';
import { XdrOperationsCenter } from './components/dashboards/XdrOperationsCenter';
import { SecurityPostureWizard } from './components/SecurityPostureWizard';
import { StorageProvisionWizard } from './components/StorageProvisionWizard';

const STORAGE_TEMPLATES: Record<StorageType, string> = {
  local: 'Local path provisioning with hostPath / local-path-provisioner',
  nfs: 'NFS client provisioner with PersistentVolumeClaim',
  smb: 'SMB CSI driver for CIFS shares',
  ceph: 'Rook Ceph block/storage classes for CephFS or RBD',
  nvme: 'NVMe-oF over TCP volume claim',
  rdma: 'RDMA-backed CSI volume',
  zfs: 'ZFS over iSCSI or ZFS CSI driver',
  anyraid: 'AnyRAID — slab-based pool over heterogeneous-capacity drives',
  iscsi: 'iSCSI block storage with CSI driver',
  glusterfs: 'GlusterFS distributed filesystem with CSI',
  longhorn: 'Longhorn cloud-native distributed block storage',
  openebs: 'OpenEBS container-native storage with multiple engines',
  portworx: 'Portworx enterprise container storage platform',
};

type CockpitView =
  | 'mission-control'
  | 'telemetry-wave'
  | 'networking'
  | 'storage'
  | 'machines'
  | 'processor-memory'
  | 'poly-compute'
  | 'acceleration'
  | 'environment'
  | 'activity'
  | 'operations'
  | 'resource-monitoring'
  | 'cluster'
  | 'xdr-operations'
  | 'security-posture'
  | 'setup'
  | 'storage-provision'
  | 'create-workload';

function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem('nexus.theme');
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

function polyComputeDeployTarget(kind: PolyComputeWorkloadKind) {
  switch (kind) {
    case 'kubevirt-vm':
      return 'vm' as const;
    case 'incus-lxc':
      return 'lxc' as const;
    case 'k8s-pod':
      return 'pod' as const;
  }
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [config, setConfig] = useState<ApplicationConfig>(defaultConfig);
  const [machineConfig, setMachineConfig] = useState(buildDefaultMachineConfig);
  const [workloadCreateConfig, setWorkloadCreateConfig] = useState(buildDefaultWorkloadCreateConfig);
  const [step, setStep] = useState(1);
  const [cockpitView, setCockpitView] = useState<CockpitView>('mission-control');
  const [editedYaml, setEditedYaml] = useState('');
  const [workloadYaml, setWorkloadYaml] = useState('');
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme);
  const [includeManifestSetup, setIncludeManifestSetup] = useState(false);

  const [clusterDeploying, setClusterDeploying] = useState(false);
  const [clusterDeployPhase, setClusterDeployPhase] = useState<DeployPhase | null>(null);
  const [clusterPhaseIndex, setClusterPhaseIndex] = useState(0);
  const [clusterPhaseCount, setClusterPhaseCount] = useState(0);
  const [clusterDeployResult, setClusterDeployResult] = useState<DeployResult | null>(null);

  const [workloadDeploying, setWorkloadDeploying] = useState(false);
  const [workloadDeployPhase, setWorkloadDeployPhase] = useState<DeployPhase | null>(null);
  const [workloadPhaseIndex, setWorkloadPhaseIndex] = useState(0);
  const [workloadPhaseCount, setWorkloadPhaseCount] = useState(0);
  const [workloadDeployResult, setWorkloadDeployResult] = useState<DeployResult | null>(null);

  const [polyDeploying, setPolyDeploying] = useState(false);
  const [polyDeployPhase, setPolyDeployPhase] = useState<DeployPhase | null>(null);
  const [polyPhaseIndex, setPolyPhaseIndex] = useState(0);
  const [polyPhaseCount, setPolyPhaseCount] = useState(0);
  const [polyDeployResult, setPolyDeployResult] = useState<DeployResult | null>(null);

  const { snapshot: telemetry, telemetry: telemetryState, setRequestedMode } = useEnvironmentTelemetry(1600);
  const clusterDashboards = useClusterDashboards(telemetryState, 1600);
  const dataSource = clusterDashboards.dataSource;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nexus.theme', theme);
    }
  }, [theme]);

  const manifest = useMemo(() => generateManifest(config), [config]);
  const displayedManifest = editedYaml || manifest;
  const validation = useMemo(() => validateKubernetesManifest(displayedManifest), [displayedManifest]);
  const livePreview = useMemo(() => buildLivePreview(displayedManifest), [displayedManifest]);
  const applyRun = useMemo(() => buildApplyTestRun(displayedManifest, config), [displayedManifest, config]);
  const vclusterPlan = useMemo(() => buildVClusterPlan(config), [config]);
  const csiPreview = useMemo(() => buildCsiTemplatePreview(config.storage), [config.storage]);
  const operationBundle = useMemo(() => buildNexusClusterOperationBundle(displayedManifest, config), [displayedManifest, config]);
  const machinePlan = useMemo(() => buildHarvesterMachineInstallPlan(machineConfig), [machineConfig]);
  const generatedWorkloadYaml = useMemo(() => buildWorkloadManifest(workloadCreateConfig), [workloadCreateConfig]);
  const displayedWorkloadYaml = workloadYaml || generatedWorkloadYaml;

  const runSimulatedDeploy = useCallback(
    async (
      phases: DeployPhase[],
      commands: string[],
      target: DeployResult['target'],
      name: string,
      setDeploying: (value: boolean) => void,
      setPhase: (value: DeployPhase | null) => void,
      setIndex: (value: number) => void,
      setCount: (value: number) => void,
      setResult: (value: DeployResult | null) => void,
      successMessage: string,
    ) => {
      setDeploying(true);
      setResult(null);
      setCount(phases.length);
      setIndex(0);
      setPhase(phases[0] ?? null);
      try {
        await simulateDeploy(phases, (index, phase) => {
          setIndex(index);
          setPhase(phase);
        });
        setResult({
          success: true,
          target,
          name,
          message: successMessage,
          kubectlCommands: commands,
          completedAt: new Date().toISOString(),
        });
        if (dataSource === 'demo') {
          if (target === 'cluster' || target === 'join-cluster') {
            recordClusterDeploy(machineConfig);
          } else if (target === 'workload') {
            recordWorkloadDeploy(config);
          } else if (target === 'vm' || target === 'lxc' || target === 'pod') {
            recordPolyComputeDeploy(workloadCreateConfig);
          }
        }
      } finally {
        setDeploying(false);
      }
    },
    [config, machineConfig, workloadCreateConfig, dataSource],
  );

  const handleDeployCluster = useCallback(async () => {
    if (!canDeployCluster(machinePlan) || clusterDeploying) return;
    const target = clusterDeployTarget(machineConfig);
    const phases = getDeployPhases(target, machineConfig.hostName);
    await runSimulatedDeploy(
      phases,
      buildClusterDeployCommands(machineConfig),
      target,
      machineConfig.hostName,
      setClusterDeploying,
      setClusterDeployPhase,
      setClusterPhaseIndex,
      setClusterPhaseCount,
      setClusterDeployResult,
      `${machineConfig.hostName} cluster operation completed. Nodes appear on Resource Monitor and Machines.`,
    );
  }, [clusterDeploying, machineConfig, machinePlan, runSimulatedDeploy]);

  const handleDeployWorkload = useCallback(async () => {
    if (!canDeployWorkload(validation) || workloadDeploying) return;
    const phases = getDeployPhases('workload', config.appName);
    await runSimulatedDeploy(
      phases,
      buildWorkloadDeployCommands(config),
      'workload',
      config.appName,
      setWorkloadDeploying,
      setWorkloadDeployPhase,
      setWorkloadPhaseIndex,
      setWorkloadPhaseCount,
      setWorkloadDeployResult,
      `${config.workloadType}/${config.appName} deployed to ${config.namespace}. Visible on Machines and Resource Monitor.`,
    );
  }, [config, runSimulatedDeploy, validation, workloadDeploying]);

  const handleDeployPolyCompute = useCallback(async () => {
    if (polyDeploying || !workloadCreateConfig.name.trim()) return;
    const target = polyComputeDeployTarget(workloadCreateConfig.kind);
    const phases = getDeployPhases(target, workloadCreateConfig.name);
    await runSimulatedDeploy(
      phases,
      buildPolyComputeDeployCommands(workloadCreateConfig),
      target,
      workloadCreateConfig.name,
      setPolyDeploying,
      setPolyDeployPhase,
      setPolyPhaseIndex,
      setPolyPhaseCount,
      setPolyDeployResult,
      `${workloadCreateConfig.name} is running on ${workloadCreateConfig.hostAffinity === 'any' ? 'the cluster' : workloadCreateConfig.hostAffinity}. Check Machines and Resource Monitor.`,
    );
  }, [polyDeploying, runSimulatedDeploy, workloadCreateConfig]);

  const openCreateWorkload = useCallback((kind: PolyComputeWorkloadKind = 'kubevirt-vm') => {
    setWorkloadCreateConfig(buildDefaultWorkloadCreateConfig(kind));
    setWorkloadYaml('');
    setPolyDeployResult(null);
    setCockpitView('create-workload');
  }, []);

  const goToClusterConsole = useCallback(() => {
    setCockpitView('cluster');
  }, []);

  const goToStorageProvision = useCallback(() => {
    setCockpitView('storage-provision');
  }, []);

  const goToSetupWizard = useCallback(() => {
    setCockpitView('setup');
  }, []);

  if (isLaunching) {
    return <LaunchSequence />;
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={(username, password) => {
          const loginAccepted = isDemoLogin(username, password);
          if (loginAccepted) {
            setIsLaunching(true);
            window.setTimeout(() => {
              setIsAuthenticated(true);
              setIsLaunching(false);
            }, 3200);
          }
          return loginAccepted;
        }}
      />
    );
  }

  const NAV_ITEMS: { id: CockpitView; label: string; sig: string; group: string }[] = [
    { id: 'mission-control', label: 'Mission Control', sig: 'CMD_00', group: 'MONITOR' },
    { id: 'telemetry-wave', label: 'Telemetry Wave', sig: 'WAVE_S', group: 'MONITOR' },
    { id: 'networking', label: 'Networking', sig: 'NET_02', group: 'MONITOR' },
    { id: 'storage', label: 'Storage', sig: 'CSI_IO', group: 'MONITOR' },
    { id: 'machines', label: 'Machines', sig: 'VM_LXC', group: 'MONITOR' },
    { id: 'processor-memory', label: 'Processor & Memory', sig: 'CPU_MEM', group: 'MONITOR' },
    { id: 'environment', label: 'Environment Intel', sig: 'ENV_IQ', group: 'MONITOR' },
    { id: 'activity', label: 'Activity Command', sig: 'ACT_CM', group: 'MONITOR' },
    { id: 'poly-compute', label: 'Poly-Compute', sig: 'PCE_04', group: 'COMPUTE' },
    { id: 'acceleration', label: 'Acceleration', sig: 'ACCEL', group: 'COMPUTE' },
    { id: 'operations', label: 'Operations', sig: 'OPS_CM', group: 'COMPUTE' },
    { id: 'resource-monitoring', label: 'Resource Monitor', sig: 'RES_WK', group: 'COMPUTE' },
    { id: 'xdr-operations', label: 'XDR Operations', sig: 'SOC_HQ', group: 'SECURE' },
    { id: 'security-posture', label: 'Security Posture', sig: 'XDR_MD', group: 'SECURE' },
    { id: 'cluster', label: 'Cluster Console', sig: 'K8S_00', group: 'DEPLOY' },
    { id: 'setup', label: 'Setup Wizard', sig: 'SETUP', group: 'DEPLOY' },
  ];

  const navGroups = ['MONITOR', 'COMPUTE', 'SECURE', 'DEPLOY'] as const;
  const showManifestPanel = cockpitView === 'cluster' || cockpitView === 'setup' || cockpitView === 'create-workload';
  const clusterReady = canDeployCluster(machinePlan);
  const workloadReady = canDeployWorkload(validation);

  const setupReviewSlot = (
    <section className="setup-review-panel" aria-label="Combined setup review">
      <header className="setup-review-header">
        <span className="hud-kicker">REVIEW // APPLY</span>
        <h3>Verify machine plan and workload manifests</h3>
        <p>Validation, live preview, and deploy actions for the combined setup.</p>
      </header>
      <ClusterIntegrationPanel
        validation={validation}
        livePreview={livePreview}
        applyRun={applyRun}
        vclusterPlan={vclusterPlan}
        csiPreview={csiPreview}
        operationBundle={operationBundle}
        config={config}
        onDeployWorkload={handleDeployWorkload}
        workloadDeployDisabled={!workloadReady || !includeManifestSetup}
        workloadDeployDisabledReason={
          !includeManifestSetup
            ? 'Enable optional manifest setup to deploy a workload from this wizard.'
            : !workloadReady
              ? 'Fix manifest validation issues before deploying.'
              : undefined
        }
        workloadDeploying={workloadDeploying}
        workloadDeployPhase={workloadDeployPhase}
        workloadPhaseIndex={workloadPhaseIndex}
        workloadPhaseCount={workloadPhaseCount}
        workloadDeployResult={workloadDeployResult}
      />
      <DeployActionBar
        primaryLabel={clusterDeployLabel(machineConfig)}
        secondaryLabel={clusterDeployResult?.success ? 'Open Cluster Console' : undefined}
        disabled={!clusterReady}
        disabledReason={clusterReady ? undefined : machinePlan.validationIssues[0]}
        deploying={clusterDeploying}
        currentPhase={clusterDeployPhase}
        phaseIndex={clusterPhaseIndex}
        phaseCount={clusterPhaseCount}
        result={clusterDeployResult}
        onDeploy={handleDeployCluster}
        onSecondary={clusterDeployResult?.success ? goToClusterConsole : undefined}
      />
    </section>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">HX</div>
          <div className="brand-wordmark">
            <h1>Harvester</h1>
            <span className="brand-sub">Nexus</span>
            <p className="brand-tagline">HCI cockpit · poly-compute · storage fabric</p>
          </div>
        </div>

        <nav className="cockpit-nav" aria-label="Cockpit views">
          {navGroups.map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${cockpitView === item.id ? 'active' : ''}`}
                  onClick={() => setCockpitView(item.id)}
                  title={item.label}
                >
                  <span className="nav-sig">{item.sig}</span>
                  <span className="nav-label">{item.label}</span>
                  {cockpitView === item.id && <span className="nav-live-dot" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <SidebarRouteDecoration />
        <ThemePicker active={theme} onSelect={setTheme} />

        <div className="wizard-step-rail">
          <span className="nav-group-label">MANIFEST STEPS</span>
          {[1, 2, 3, 4, 5, 6, 7].map((s, i) => {
            const labels = ['Workload', 'Storage', 'Networking', 'Security', 'Monitoring', 'GitOps', 'Review'];
            return (
              <button key={s} className={`step-rail-btn ${step === s ? 'active' : ''}`} onClick={() => { setStep(s); setCockpitView('setup'); }}>
                <span className="step-num">{s}</span>
                <span>{labels[i]}</span>
              </button>
            );
          })}
        </div>
        <div className="storage-summary">
          <span className="nav-group-label">STORAGE TEMPLATE</span>
          <p>{STORAGE_TEMPLATES[config.storage.storageType]}</p>
        </div>
      </aside>
      <main className="main-view">
        <EnvironmentTicker
          snapshot={telemetry}
          telemetry={telemetryState}
          onTelemetryModeChange={setRequestedMode}
        />
        {cockpitView === 'mission-control' && <MissionControlView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'telemetry-wave' && <TelemetryWaveView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'networking' && <NetworkingDashboardView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'storage' && (
          <StorageDashboardView
            telemetry={telemetry}
            dataSource={dataSource}
            storageDashboard={clusterDashboards.storage}
            onConfigureStorage={goToStorageProvision}
          />
        )}
        {cockpitView === 'storage-provision' && (
          <StorageProvisionWizard dataSource={dataSource} onClose={() => setCockpitView('storage')} />
        )}
        {cockpitView === 'machines' && (
          <MachinesDashboardView
            telemetry={telemetry}
            dataSource={dataSource}
            machinesDashboard={clusterDashboards.machines}
            storageDashboard={clusterDashboards.storage}
            onCreateWorkload={openCreateWorkload}
          />
        )}
        {cockpitView === 'processor-memory' && <ProcessorMemoryDashboardView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'environment' && (
          <EnvironmentIntelHudView
            telemetry={telemetry}
            dataSource={dataSource}
            machinesDashboard={clusterDashboards.machines}
          />
        )}
        {cockpitView === 'activity' && <ActivityDashboardView dataSource={dataSource} />}
        {cockpitView === 'poly-compute' && <PolyComputeDashboardView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'acceleration' && <AccelerationDashboardView telemetry={telemetry} dataSource={dataSource} />}
        {cockpitView === 'operations' && (
          <OperationsDashboardView telemetry={telemetry} dataSource={dataSource} operationsLinks={clusterDashboards.operations} />
        )}
        {cockpitView === 'resource-monitoring' && (
          <ResourceMonitorHudView
            telemetry={telemetry}
            dataSource={dataSource}
            resourceMonitoring={clusterDashboards.resourceMonitoring}
            machinesDashboard={clusterDashboards.machines}
          />
        )}
        {cockpitView === 'xdr-operations' && (
          <XdrOperationsCenter
            telemetry={telemetryState}
            xdrLive={clusterDashboards.xdr}
            fleet={clusterDashboards.machines.fleet}
          />
        )}
        {cockpitView === 'security-posture' && <SecurityPostureWizard />}
        {cockpitView === 'cluster' && (
          <ClusterIntegrationPanel
            validation={validation}
            livePreview={livePreview}
            applyRun={applyRun}
            vclusterPlan={vclusterPlan}
            csiPreview={csiPreview}
            operationBundle={operationBundle}
            config={config}
            onDeployWorkload={handleDeployWorkload}
            workloadDeployDisabled={!workloadReady}
            workloadDeployDisabledReason={workloadReady ? undefined : 'Fix manifest validation issues in the YAML panel below.'}
            workloadDeploying={workloadDeploying}
            workloadDeployPhase={workloadDeployPhase}
            workloadPhaseIndex={workloadPhaseIndex}
            workloadPhaseCount={workloadPhaseCount}
            workloadDeployResult={workloadDeployResult}
            onCreateWorkload={() => openCreateWorkload()}
            onOpenSetup={goToSetupWizard}
          />
        )}
        {cockpitView === 'setup' && (
          <UnifiedSetupWizard
            machineConfig={machineConfig}
            machinePlan={machinePlan}
            onMachineChange={setMachineConfig}
            manifestConfig={config}
            onManifestChange={setConfig}
            manifestStep={step}
            onManifestStepChange={setStep}
            includeManifestSetup={includeManifestSetup}
            onIncludeManifestSetupChange={setIncludeManifestSetup}
            manifestValidation={validation}
            onDeployCluster={handleDeployCluster}
            clusterDeployLabel={clusterDeployLabel(machineConfig)}
            clusterDeployDisabled={!clusterReady}
            clusterDeployDisabledReason={clusterReady ? undefined : machinePlan.validationIssues[0]}
            clusterDeploying={clusterDeploying}
            clusterDeployPhase={clusterDeployPhase}
            clusterPhaseIndex={clusterPhaseIndex}
            clusterPhaseCount={clusterPhaseCount}
            clusterDeployResult={clusterDeployResult}
            onDeployWorkload={handleDeployWorkload}
            workloadDeployDisabled={!workloadReady || !includeManifestSetup}
            workloadDeployDisabledReason={
              !includeManifestSetup
                ? 'Enable optional manifest setup to deploy a workload.'
                : !workloadReady
                  ? 'Fix manifest validation issues before deploying.'
                  : undefined
            }
            workloadDeploying={workloadDeploying}
            workloadDeployPhase={workloadDeployPhase}
            workloadPhaseIndex={workloadPhaseIndex}
            workloadPhaseCount={workloadPhaseCount}
            workloadDeployResult={workloadDeployResult}
            onGoToClusterConsole={goToClusterConsole}
            reviewSlot={setupReviewSlot}
          />
        )}
        {cockpitView === 'create-workload' && (
          <WorkloadCreateWizard
            config={workloadCreateConfig}
            onChange={(next) => {
              setWorkloadCreateConfig(next);
              setWorkloadYaml('');
            }}
            deploying={polyDeploying}
            currentPhase={polyDeployPhase}
            phaseIndex={polyPhaseIndex}
            phaseCount={polyPhaseCount}
            deployResult={polyDeployResult}
            onDeploy={handleDeployPolyCompute}
            onCancel={() => setCockpitView('machines')}
          />
        )}
        {showManifestPanel && (
          <section className="manifest-panel">
            <div className="panel-header">
              <h2>{cockpitView === 'create-workload' ? 'Workload manifest' : 'Generated manifest'}</h2>
              <span className="badge">Kubernetes 1.28+</span>
            </div>
            <YamlEditor
              value={cockpitView === 'create-workload' ? displayedWorkloadYaml : displayedManifest}
              onChange={cockpitView === 'create-workload' ? setWorkloadYaml : setEditedYaml}
              validationIssues={
                cockpitView === 'create-workload'
                  ? []
                  : validation.issues.map((issue) => issue.message)
              }
            />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

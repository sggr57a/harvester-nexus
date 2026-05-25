import { useEffect, useMemo, useState } from 'react';
import { ApplicationConfig, defaultConfig, StorageType } from './types';
import { generateManifest } from './lib/manifestGenerator';
import { buildApplyTestRun, buildCsiTemplatePreview, buildLivePreview, buildNexusClusterOperationBundle, buildVClusterPlan, validateKubernetesManifest } from './lib/clusterWorkflow';
import { buildDefaultMachineConfig, buildHarvesterMachineInstallPlan } from './lib/harvesterMachineWizard';
import { isDemoLogin } from './lib/auth';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from './lib/themes';
import { ClusterIntegrationPanel } from './components/ClusterIntegrationPanel';
import { ResourceMonitoringPage } from './components/ActiveWorkPage';
import { LaunchSequence } from './components/LaunchSequence';
import { LoginScreen } from './components/LoginScreen';
import { HudDashboard } from './components/HudDashboard';
import { ThemePicker } from './components/ThemePicker';
import { UnifiedSetupWizard } from './components/UnifiedSetupWizard';
import { YamlEditor } from './components/YamlEditor';
import {
  AccelerationDashboardView,
  MachinesDashboardView,
  NetworkingDashboardView,
  OperationsDashboardView,
  PolyComputeDashboardView,
  ProcessorMemoryDashboardView,
  StorageDashboardView,
} from './components/dashboards/Dashboards';

const STORAGE_TEMPLATES: Record<StorageType, string> = {
  local: 'Local path provisioning with hostPath / local-path-provisioner',
  nfs: 'NFS client provisioner with PersistentVolumeClaim',
  smb: 'SMB CSI driver for CIFS shares',
  ceph: 'Rook Ceph block/storage classes for CephFS or RBD',
  nvme: 'NVMe-oF over TCP volume claim',
  rdma: 'RDMA-backed CSI volume',
  zfs: 'ZFS over iSCSI or ZFS CSI driver',
  iscsi: 'iSCSI block storage with CSI driver',
  glusterfs: 'GlusterFS distributed filesystem with CSI',
  longhorn: 'Longhorn cloud-native distributed block storage',
  openebs: 'OpenEBS container-native storage with multiple engines',
  portworx: 'Portworx enterprise container storage platform',
};

type CockpitView =
  | 'dashboard'
  | 'networking'
  | 'storage'
  | 'machines'
  | 'processor-memory'
  | 'poly-compute'
  | 'acceleration'
  | 'operations'
  | 'resource-monitoring'
  | 'cluster'
  | 'setup';

function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const stored = window.localStorage.getItem('nexus.theme');
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [config, setConfig] = useState<ApplicationConfig>(defaultConfig);
  const [machineConfig, setMachineConfig] = useState(buildDefaultMachineConfig);
  const [step, setStep] = useState(1);
  const [cockpitView, setCockpitView] = useState<CockpitView>('dashboard');
  const [editedYaml, setEditedYaml] = useState('');
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme);
  const [includeManifestSetup, setIncludeManifestSetup] = useState(false);

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">HX</div>
          <div className="brand-wordmark">
            <h1>Harvester</h1>
            <span className="brand-sub">Nexus</span>
            <p className="brand-tagline">Dark-mode workload & storage manifest generator</p>
          </div>
        </div>
        <div className="step-list">
          <button className={cockpitView === 'dashboard' ? 'active' : ''} onClick={() => setCockpitView('dashboard')}>
            HUD Dashboard
          </button>
          <button className={cockpitView === 'networking' ? 'active' : ''} onClick={() => setCockpitView('networking')}>
            Networking
          </button>
          <button className={cockpitView === 'storage' ? 'active' : ''} onClick={() => setCockpitView('storage')}>
            Storage
          </button>
          <button className={cockpitView === 'machines' ? 'active' : ''} onClick={() => setCockpitView('machines')}>
            Machines &amp; Containers
          </button>
          <button className={cockpitView === 'processor-memory' ? 'active' : ''} onClick={() => setCockpitView('processor-memory')}>
            Processor &amp; Memory
          </button>
          <button className={cockpitView === 'poly-compute' ? 'active' : ''} onClick={() => setCockpitView('poly-compute')}>
            Poly-Compute Engine
          </button>
          <button className={cockpitView === 'acceleration' ? 'active' : ''} onClick={() => setCockpitView('acceleration')}>
            Acceleration
          </button>
          <button className={cockpitView === 'operations' ? 'active' : ''} onClick={() => setCockpitView('operations')}>
            Operations &amp; Compliance
          </button>
          <button className={cockpitView === 'resource-monitoring' ? 'active' : ''} onClick={() => setCockpitView('resource-monitoring')}>
            Resource Monitoring
          </button>
          <button className={cockpitView === 'cluster' ? 'active' : ''} onClick={() => setCockpitView('cluster')}>
            Cluster Console
          </button>
          <button className={cockpitView === 'setup' ? 'active' : ''} onClick={() => setCockpitView('setup')}>
            Setup Wizard
          </button>
        </div>
        <ThemePicker active={theme} onSelect={setTheme} />
        <div className="storage-summary">
          <h2>Storage template</h2>
          <p>{STORAGE_TEMPLATES[config.storage.storageType]}</p>
        </div>
      </aside>
      <main className="main-view">
        {cockpitView === 'dashboard' && <HudDashboard activeTheme={theme} />}
        {cockpitView === 'networking' && <NetworkingDashboardView />}
        {cockpitView === 'storage' && <StorageDashboardView />}
        {cockpitView === 'machines' && <MachinesDashboardView />}
        {cockpitView === 'processor-memory' && <ProcessorMemoryDashboardView />}
        {cockpitView === 'poly-compute' && <PolyComputeDashboardView />}
        {cockpitView === 'acceleration' && <AccelerationDashboardView />}
        {cockpitView === 'operations' && <OperationsDashboardView />}
        {cockpitView === 'resource-monitoring' && <ResourceMonitoringPage />}
        {cockpitView === 'cluster' && (
          <ClusterIntegrationPanel
            validation={validation}
            livePreview={livePreview}
            applyRun={applyRun}
            vclusterPlan={vclusterPlan}
            csiPreview={csiPreview}
            operationBundle={operationBundle}
            config={config}
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
          />
        )}
        <section className="manifest-panel">
          <div className="panel-header">
            <h2>Generated manifest</h2>
            <span className="badge">Kubernetes 1.28+</span>
          </div>
          <YamlEditor value={displayedManifest} onChange={setEditedYaml} validationIssues={validation.issues.map((issue) => issue.message)} />
        </section>
      </main>
    </div>
  );
}

export default App;

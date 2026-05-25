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
import { NexusMachineWizard } from './components/NexusMachineWizard';
import { ThemePicker } from './components/ThemePicker';
import { Wizard } from './components/Wizard';
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
  | 'machine'
  | 'wizard';

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

  const NAV_ITEMS: { id: CockpitView; label: string; sig: string; group: string }[] = [
    { id: 'dashboard', label: 'HUD Dashboard', sig: 'TX_001', group: 'MONITOR' },
    { id: 'networking', label: 'Networking', sig: 'NET_02', group: 'MONITOR' },
    { id: 'storage', label: 'Storage', sig: 'CSI_IO', group: 'MONITOR' },
    { id: 'machines', label: 'Machines', sig: 'VM_LXC', group: 'MONITOR' },
    { id: 'processor-memory', label: 'Processor & Memory', sig: 'CPU_MEM', group: 'MONITOR' },
    { id: 'poly-compute', label: 'Poly-Compute', sig: 'PCE_04', group: 'COMPUTE' },
    { id: 'acceleration', label: 'Acceleration', sig: 'ACCEL', group: 'COMPUTE' },
    { id: 'operations', label: 'Operations', sig: 'OPS_CM', group: 'COMPUTE' },
    { id: 'resource-monitoring', label: 'Resource Monitor', sig: 'RES_WK', group: 'COMPUTE' },
    { id: 'cluster', label: 'Cluster Console', sig: 'K8S_00', group: 'DEPLOY' },
    { id: 'machine', label: 'Machine Wizard', sig: 'MACH_W', group: 'DEPLOY' },
    { id: 'wizard', label: 'Manifest Wizard', sig: 'MFT_WZ', group: 'DEPLOY' },
  ];

  const navGroups = ['MONITOR', 'COMPUTE', 'DEPLOY'] as const;

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

        <ThemePicker active={theme} onSelect={setTheme} />

        <div className="wizard-step-rail">
          <span className="nav-group-label">MANIFEST STEPS</span>
          {[1,2,3,4,5,6,7].map((s, i) => {
            const labels = ['Workload','Storage','Networking','Security','Monitoring','GitOps','Review'];
            return (
              <button key={s} className={`step-rail-btn ${step === s ? 'active' : ''}`} onClick={() => setStep(s)}>
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
        {cockpitView === 'dashboard' && <HudDashboard />}
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
        {cockpitView === 'machine' && <NexusMachineWizard config={machineConfig} plan={machinePlan} onChange={setMachineConfig} />}
        {cockpitView === 'wizard' && <Wizard currentStep={step} config={config} onChange={setConfig} onNext={() => setStep(Math.min(step + 1, 7))} onBack={() => setStep(Math.max(step - 1, 1))} />}
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

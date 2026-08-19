import YAML from 'yaml';

export type HarvesterInstallMode = 'create' | 'join' | 'binaries';
export type HarvesterVipMode = 'static' | 'dhcp';

export interface LiveMigrationConfig {
  enabled: boolean;
  processModel: 'vmotion-style';
  preserveMemoryState: boolean;
  allowShutdown: boolean;
}

export interface NvmeOverRdmaConfig {
  enabled: boolean;
  fabricInterface: string;
  storageClass: string;
}

export interface MemoryTieringConfig {
  enabled: boolean;
  mode: 'auto' | 'phase-change' | 'nvme' | 'cxl';
  policy: 'capacity' | 'bandwidth';
  device: string;
  ratio: number;
}

export interface PolyComputeConfig {
  kubevirt: boolean;
  incusLxc: boolean;
  k8sPods: boolean;
}

export interface HardwareAccelerationConfig {
  spdk: boolean;
  dpdk: boolean;
  vhostUser: boolean;
  numaPinning: boolean;
  hugepages1G: number;
  gpuPassthrough: boolean;
  nestedVirt: boolean;
}

export interface HarvesterMachineConfig {
  installMode: HarvesterInstallMode;
  hostName: string;
  installDisk: string;
  dataDisk: string;
  managementInterface: string;
  vipMode: HarvesterVipMode;
  virtualIp: string;
  serverUrl?: string;
  clusterToken: string;
  dnsServers: string[];
  ntpServers: string[];
  liveMigration: LiveMigrationConfig;
  nvmeOverRdma: NvmeOverRdmaConfig;
  memoryTiering: MemoryTieringConfig;
  polyCompute: PolyComputeConfig;
  hardwareAcceleration: HardwareAccelerationConfig;
  proxyUrl?: string;
  sshKeysUrl?: string;
  customConfigUrl?: string;
}

export interface MachineWizardStep {
  id: 'mode' | 'hardware' | 'storage' | 'network' | 'cluster' | 'migration' | 'acceleration' | 'poly-compute' | 'source' | 'review';
  title: string;
  detail: string;
  status: 'ready' | 'required' | 'optional';
}

export interface HarvesterMachineInstallPlan {
  productName: 'Nexus';
  sourceRoot: 'platform/harvester';
  steps: MachineWizardStep[];
  configYaml: string;
  bootParameters: string[];
  validationIssues: string[];
}

export function buildDefaultMachineConfig(): HarvesterMachineConfig {
  return {
    installMode: 'create',
    hostName: 'nexus-node-01',
    installDisk: '/dev/sda',
    dataDisk: '/dev/sdb',
    managementInterface: 'eth0',
    vipMode: 'static',
    virtualIp: '192.168.122.100',
    clusterToken: 'nexus-cluster-token',
    dnsServers: ['1.1.1.1'],
    ntpServers: ['0.suse.pool.ntp.org'],
    liveMigration: {
      enabled: true,
      processModel: 'vmotion-style',
      preserveMemoryState: true,
      allowShutdown: false,
    },
    nvmeOverRdma: {
      enabled: true,
      fabricInterface: 'mlx5_0',
      storageClass: 'nexus-rdma-nvme',
    },
    memoryTiering: {
      enabled: true,
      mode: 'auto',
      policy: 'capacity',
      device: 'auto',
      ratio: 1.0,
    },
    polyCompute: {
      kubevirt: true,
      incusLxc: true,
      k8sPods: true,
    },
    hardwareAcceleration: {
      spdk: true,
      dpdk: true,
      vhostUser: true,
      numaPinning: true,
      hugepages1G: 64,
      gpuPassthrough: true,
      nestedVirt: false,
    },
  };
}

export function validateHarvesterMachineConfig(config: HarvesterMachineConfig): string[] {
  const issues: string[] = [];

  if (!config.hostName.trim()) {
    issues.push('Host name is required for Harvester node identity.');
  }
  if (!config.installDisk.trim()) {
    issues.push('Install disk is required so the appliance knows where to write Nexus.');
  }
  if (!config.managementInterface.trim()) {
    issues.push('Management interface is required for the Harvester management network.');
  }
  if (config.vipMode === 'static' && !config.virtualIp.trim()) {
    issues.push('Virtual IP is required when VIP mode is static.');
  }
  if (config.installMode !== 'binaries' && !config.clusterToken.trim()) {
    issues.push('Cluster token is required for create and join modes.');
  }
  if (config.installMode === 'join' && !config.serverUrl?.trim()) {
    issues.push('Server URL is required when joining an existing Nexus cluster.');
  }
  if (!config.polyCompute.kubevirt && !config.polyCompute.incusLxc && !config.polyCompute.k8sPods) {
    issues.push('Select at least one runtime (KubeVirt, Incus/LXC, or K8s pods) for the poly-compute engine.');
  }
  if (config.hardwareAcceleration.hugepages1G < 0) {
    issues.push('1 GiB hugepage count must be zero or greater.');
  }
  if (config.hardwareAcceleration.gpuPassthrough && !config.hardwareAcceleration.numaPinning) {
    issues.push('GPU pass-through requires NUMA pinning to keep PCI-e devices local to the workload.');
  }

  return issues;
}

function buildSteps(config: HarvesterMachineConfig, validationIssues: string[]): MachineWizardStep[] {
  const hasBlockingIssues = validationIssues.length > 0;

  return [
    {
      id: 'mode',
      title: 'Install mode',
      detail: config.installMode === 'create' ? 'Create a new Nexus HCI cluster' : config.installMode === 'join' ? 'Join an existing Nexus cluster' : 'Install platform binaries only',
      status: 'ready',
    },
    {
      id: 'hardware',
      title: 'Hardware profile',
      detail: `${config.hostName || 'unnamed node'} mapped to Harvester hardware checks`,
      status: config.hostName ? 'ready' : 'required',
    },
    {
      id: 'storage',
      title: 'Storage disks',
      detail: `${config.installDisk || 'install disk missing'} + ${config.dataDisk || 'shared data disk not set'}`,
      status: config.installDisk ? 'ready' : 'required',
    },
    {
      id: 'network',
      title: 'Management network',
      detail: `${config.managementInterface || 'interface missing'} / ${config.vipMode.toUpperCase()} VIP`,
      status: config.managementInterface && (config.vipMode === 'dhcp' || config.virtualIp) ? 'ready' : 'required',
    },
    {
      id: 'cluster',
      title: 'Cluster identity',
      detail: config.installMode === 'binaries' ? 'Token skipped for binary-only install' : 'Token staged for create/join flow',
      status: config.installMode === 'binaries' || config.clusterToken ? 'ready' : 'required',
    },
    {
      id: 'migration',
      title: 'Live migration',
      detail: config.liveMigration.enabled ? 'vMotion-style memory-preserving workload migration enabled' : 'Live migration disabled',
      status: config.liveMigration.enabled ? 'ready' : 'optional',
    },
    {
      id: 'acceleration',
      title: 'Storage acceleration',
      detail: `${config.nvmeOverRdma.enabled ? 'NVMe/RDMA enabled' : 'NVMe/RDMA optional'} / ${config.memoryTiering.enabled ? `${config.memoryTiering.mode} tiering` : 'tiering optional'}`,
      status: config.nvmeOverRdma.enabled || config.memoryTiering.enabled ? 'ready' : 'optional',
    },
    {
      id: 'poly-compute',
      title: 'Poly-compute engine',
      detail: [
        config.polyCompute.kubevirt ? 'KubeVirt VMs' : null,
        config.polyCompute.incusLxc ? 'Incus / LXC system containers' : null,
        config.polyCompute.k8sPods ? 'K8s pods' : null,
      ].filter(Boolean).join(' · ') || 'no runtimes selected',
      status: (config.polyCompute.kubevirt || config.polyCompute.incusLxc || config.polyCompute.k8sPods) ? 'ready' : 'required',
    },
    {
      id: 'source',
      title: 'Harvester source',
      detail: 'Imported platform source is owned in platform/harvester',
      status: 'ready',
    },
    {
      id: 'review',
      title: 'Review and boot',
      detail: hasBlockingIssues ? `${validationIssues.length} required fields pending` : 'Automatic install config ready',
      status: hasBlockingIssues ? 'required' : 'ready',
    },
  ];
}

export function buildHarvesterMachineInstallPlan(config: HarvesterMachineConfig): HarvesterMachineInstallPlan {
  const validationIssues = validateHarvesterMachineConfig(config);
  const configDocument = {
    scheme_version: 1,
    token: config.clusterToken || undefined,
    server_url: config.installMode === 'join' ? config.serverUrl : undefined,
    os: {
      hostname: config.hostName,
      ssh_authorized_keys_url: config.sshKeysUrl || undefined,
      ntp_servers: config.ntpServers,
      dns_nameservers: config.dnsServers,
      http_proxy: config.proxyUrl || undefined,
    },
    install: {
      mode: config.installMode,
      device: config.installDisk,
      data_disk: config.dataDisk,
      management_interface: {
        interfaces: [{ name: config.managementInterface }],
      },
      vip_mode: config.vipMode,
      vip: config.vipMode === 'static' ? config.virtualIp : undefined,
      config_url: config.customConfigUrl || undefined,
    },
    nexus: {
      product: 'Nexus',
      harvester_source_root: 'platform/harvester',
      ui_profile: 'cyberpunk-hud',
      live_migration: {
        enabled: config.liveMigration.enabled,
        process_model: config.liveMigration.processModel,
        preserve_memory_state: config.liveMigration.preserveMemoryState,
        allow_shutdown: config.liveMigration.allowShutdown,
        workload_types: ['lxc', 'docker', 'virtual-machine'],
      },
      nvme_over_rdma: {
        enabled: config.nvmeOverRdma.enabled,
        fabric_interface: config.nvmeOverRdma.fabricInterface,
        storage_class: config.nvmeOverRdma.storageClass,
      },
      memory_tiering: {
        enabled: config.memoryTiering.enabled,
        mode: config.memoryTiering.mode,
        policy: config.memoryTiering.policy,
        device: config.memoryTiering.device,
        ratio: config.memoryTiering.ratio,
      },
      poly_compute: {
        kubevirt: config.polyCompute.kubevirt,
        incus_lxc: config.polyCompute.incusLxc,
        k8s_pods: config.polyCompute.k8sPods,
      },
      hardware_acceleration: {
        spdk: config.hardwareAcceleration.spdk,
        dpdk: config.hardwareAcceleration.dpdk,
        vhost_user: config.hardwareAcceleration.vhostUser,
        numa_pinning: config.hardwareAcceleration.numaPinning,
        hugepages_1g: config.hardwareAcceleration.hugepages1G,
        gpu_passthrough: config.hardwareAcceleration.gpuPassthrough,
        nested_virtualization: config.hardwareAcceleration.nestedVirt,
      },
    },
  };

  return {
    productName: 'Nexus',
    sourceRoot: 'platform/harvester',
    steps: buildSteps(config, validationIssues),
    configYaml: YAML.stringify(configDocument),
    bootParameters: [
      'harvester.install.automatic=true',
      `harvester.install.mode=${config.installMode}`,
      `harvester.install.device=${config.installDisk || '<install-disk>'}`,
      `harvester.install.management_interface=${config.managementInterface || '<management-interface>'}`,
      `nexus.features.nvme_over_rdma=${config.nvmeOverRdma.enabled}`,
      config.memoryTiering.enabled ? `nexus.features.memory_tiering=${config.memoryTiering.mode}` : 'nexus.features.memory_tiering=false',
      config.memoryTiering.enabled ? `nexus.features.memory_tiering.policy=${config.memoryTiering.policy}` : 'nexus.features.memory_tiering.policy=off',
      ...(config.memoryTiering.enabled
        ? ['zswap.enabled=1', 'zswap.compressor=zstd', 'zswap.max_pool_percent=20']
        : []),
      `nexus.poly_compute=${[
        config.polyCompute.kubevirt ? 'kubevirt' : null,
        config.polyCompute.incusLxc ? 'incus' : null,
        config.polyCompute.k8sPods ? 'pods' : null,
      ].filter(Boolean).join(',') || 'none'}`,
      `nexus.acceleration.spdk=${config.hardwareAcceleration.spdk}`,
      `nexus.acceleration.dpdk=${config.hardwareAcceleration.dpdk}`,
      `nexus.acceleration.numa_pinning=${config.hardwareAcceleration.numaPinning}`,
      `nexus.acceleration.hugepages_1g=${config.hardwareAcceleration.hugepages1G}`,
      `nexus.acceleration.gpu_passthrough=${config.hardwareAcceleration.gpuPassthrough}`,
      `nexus.acceleration.nested_virt=${config.hardwareAcceleration.nestedVirt}`,
    ],
    validationIssues,
  };
}

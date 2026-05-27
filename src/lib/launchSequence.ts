export interface LaunchStep {
  label: string;
  progress: number;
  signal: string;
}

/** A HUD callout placed around the launch screen. Each one is a chamfered
 *  panel with a header, a body, and a lead-line that connects toward the
 *  central wordmark. The body lines are animated through during the boot
 *  so the screen reads as 'systems coming online' instead of static text. */
export interface LaunchCallout {
  /** Stable id used as React key + animation seed. */
  id: string;
  /** Position quadrant — drives placement on the screen. */
  anchor:
    | 'top-left'
    | 'top-right'
    | 'mid-left'
    | 'mid-right'
    | 'bottom-left'
    | 'bottom-right';
  /** Kicker label (small, all-caps). */
  kicker: string;
  /** Headline text (bigger, also all-caps). */
  headline: string;
  /** Detail lines that boot through during the launch. */
  lines: string[];
  /** Type of end-cap glyph rendered at the lead-line target. */
  endcap: 'reticle' | 'plus' | 'warning' | 'dot' | 'crosshair';
  /** Delay before this callout starts animating in. */
  delayMs: number;
}

/** Live values shown in the central data block. Each tick of the launch
 *  redraws these — gives the screen the same 'rapidly-updating ticker'
 *  feeling the reference imagery has. */
export interface LaunchDataBlock {
  /** Three columns of (label, value) pairs that update every tick. */
  columns: Array<{ label: string; value: string }>;
  /** Status row at the bottom of the block (pulse / mode / warning). */
  status: string;
}

export interface LaunchSequence {
  durationMs: number;
  steps: LaunchStep[];
  callouts: LaunchCallout[];
}

export function buildLaunchSequence(): LaunchSequence {
  return {
    durationMs: 3200,
    steps: [
      { label: 'Authenticating identity', progress: 12, signal: 'credential-lock' },
      { label: 'Charging interface meter', progress: 34, signal: 'meter-rise' },
      { label: 'Resolving cluster topology', progress: 58, signal: 'topology-scan' },
      { label: 'Synchronizing HUD layers', progress: 82, signal: 'hud-compose' },
      { label: 'Launching Nexus HUD', progress: 100, signal: 'interface-ready' },
    ],
    callouts: [
      {
        id: 'identity',
        anchor: 'top-left',
        kicker: 'IDENTITY',
        headline: 'OPERATOR LOCK',
        lines: [
          'subject: admin@nexus.local',
          'role: cluster-admin',
          'mfa: webauthn // resident key',
          'session: 12h sliding · refresh ok',
        ],
        endcap: 'crosshair',
        delayMs: 60,
      },
      {
        id: 'topology',
        anchor: 'top-right',
        kicker: 'TOPOLOGY',
        headline: 'CLUSTER ONLINE',
        lines: [
          'control-plane · 3 / 3 quorum',
          'workers · 5 / 5 healthy',
          'kubevirt · 18 vm · incus · 22 lxc',
          'pods · 98 ready · 4 pending',
        ],
        endcap: 'reticle',
        delayMs: 220,
      },
      {
        id: 'runtimes',
        anchor: 'mid-left',
        kicker: 'POLY-COMPUTE',
        headline: 'RUNTIMES READY',
        lines: [
          'kubevirt-virt-handler · running',
          'incus / lxc · daemon online',
          'containerd · spdk userspace ok',
          'numa pinning · 1g hugepages · 64',
        ],
        endcap: 'plus',
        delayMs: 460,
      },
      {
        id: 'storage',
        anchor: 'mid-right',
        kicker: 'STORAGE FABRIC',
        headline: 'CSI BOUND',
        lines: [
          'longhorn · ceph · vitastor · ok',
          'anyraid · slab plan reconciled',
          'nvme-of // rdma · target up',
          'snapshot class · vsc-default',
        ],
        endcap: 'plus',
        delayMs: 700,
      },
      {
        id: 'security',
        anchor: 'bottom-left',
        kicker: 'XDR // MDR',
        headline: 'SENSORS ARMED',
        lines: [
          'falco · tetragon · ebpf bpf-modern',
          'wazuh agent · suricata · hubble',
          'rules · 18 sigma · feeds · 10 free',
          'opencanary · standing watch',
        ],
        endcap: 'warning',
        delayMs: 940,
      },
      {
        id: 'network',
        anchor: 'bottom-right',
        kicker: 'NETWORK',
        headline: 'CILIUM UP',
        lines: [
          'cni · cilium 1.15 · ipv4 + ipv6',
          'networkpolicy · 42 cluster-wide',
          'ingress-nginx · tls reload ok',
          'service-mesh · linkerd / istio',
        ],
        endcap: 'dot',
        delayMs: 1180,
      },
    ],
  };
}

/** Generate a deterministic-but-changing data-block for a given tick.
 *  Used by the central data readout to give the launch screen its
 *  'live data' feel without pulling actual telemetry. */
export function launchDataBlock(tick: number): LaunchDataBlock {
  const tt = tick;
  const watts = 1480 + (Math.sin(tt * 0.31) + 1) * 90;
  const ipgs = 12_000 + (Math.sin(tt * 0.17) + 1) * 4500;
  const cpu = 38 + (Math.sin(tt * 0.43) + 1) * 18;
  const dram = 52 + (Math.cos(tt * 0.27) + 1) * 12;
  const tps = 1840 + (Math.sin(tt * 0.61) + 1) * 220;
  const mttd = 3.4 + (Math.sin(tt * 0.49) + 1) * 0.6;
  const mttr = 4.6 + (Math.cos(tt * 0.33) + 1) * 0.8;
  const trust = 87 + Math.round(Math.sin(tt * 0.21) * 2);
  return {
    columns: [
      { label: 'sys.watts', value: `${watts.toFixed(1)} W` },
      { label: 'sys.cpu',   value: `${cpu.toFixed(1)} %` },
      { label: 'sys.dram',  value: `${dram.toFixed(1)} %` },
      { label: 'net.ingress', value: `${ipgs.toFixed(0)} mbps` },
      { label: 'sec.tps',   value: `${tps.toFixed(0)} /s` },
      { label: 'sec.mttd',  value: `${mttd.toFixed(2)} s` },
      { label: 'sec.mttr',  value: `${mttr.toFixed(2)} s` },
      { label: 'trust',     value: `${trust} / 100` },
    ],
    status: tick % 6 < 3 ? 'BOOT // PHASE-LOCK' : 'BOOT // SYNC-OK',
  };
}

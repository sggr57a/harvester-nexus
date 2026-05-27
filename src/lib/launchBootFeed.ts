/**
 * Launch boot-feed data source.
 *
 * Drives every variant of the launch screen. Two streams:
 *
 *   1. `systems`: a curated list of platform subsystems with their loading
 *      progress (0..1). Used by the LEFT panel of every variant — a compact
 *      checklist that visibly progresses while the launch animation plays.
 *
 *   2. `logLines`: a high-frequency stream of fake-but-plausible kernel /
 *      bootstrap log lines. Used by the RIGHT panel of every variant —
 *      a fast-scrolling diagnostic dump that gives the screen its
 *      'system actively booting' density. New lines arrive every ~80 ms.
 *
 * Pure data — no DOM, no React tree-specific assumptions.
 */

export type SystemPhase = 'queued' | 'loading' | 'ready';

export interface BootSystem {
  /** Stable id used as React key. */
  id: string;
  /** Display label (≤ 28 chars to fit a left rail). */
  label: string;
  /** Loading progress, 0..1. */
  progress: number;
  /** Phase derived from progress (queued < 0.05, loading 0.05..0.99, ready ≥ 1.0). */
  phase: SystemPhase;
  /** Sub-phase / version / target detail shown next to the label. */
  detail: string;
  /** Approximate completion time in ms (relative to launch start). Drives
   *  the synthesized progress curve. */
  finishesAtMs: number;
}

const RAW_SYSTEMS: Array<Omit<BootSystem, 'progress' | 'phase'>> = [
  { id: 'identity',     label: 'identity / webauthn',       detail: 'kerb · oidc · vault',         finishesAtMs:  240 },
  { id: 'kubelet',      label: 'kubelet / runtime',         detail: 'cri-o + containerd',           finishesAtMs:  420 },
  { id: 'etcd',         label: 'etcd / quorum',             detail: '3-node raft · v3.5',           finishesAtMs:  640 },
  { id: 'apiserver',    label: 'kube-apiserver',            detail: 'tls reload · 1.31',            finishesAtMs:  840 },
  { id: 'cni',          label: 'cilium / cni',              detail: 'ebpf bpf-modern · 1.15',       finishesAtMs: 1080 },
  { id: 'csi',          label: 'csi · longhorn / vitastor', detail: 'storage classes · 14',         finishesAtMs: 1280 },
  { id: 'kubevirt',     label: 'kubevirt / virt-handler',   detail: '18 vm online',                 finishesAtMs: 1480 },
  { id: 'incus',        label: 'incus · lxc daemon',        detail: '22 lxc online',                finishesAtMs: 1620 },
  { id: 'ingress',      label: 'ingress · nginx-tls',       detail: 'ingressclass · 4 vhost',       finishesAtMs: 1760 },
  { id: 'mesh',         label: 'mesh · linkerd / istio',    detail: 'mtls · sidecar-injector',      finishesAtMs: 1900 },
  { id: 'gitops',       label: 'gitops · argocd / flux',    detail: '142 manifests synced',         finishesAtMs: 2080 },
  { id: 'xdr-sensors',  label: 'xdr · falco · tetragon',    detail: '17 sensors armed',             finishesAtMs: 2280 },
  { id: 'siem',         label: 'siem · wazuh + opensearch', detail: 'event lake · 9.6 gb',          finishesAtMs: 2440 },
  { id: 'intel',        label: 'threat-intel · misp + otx', detail: '10 feeds · 18 rules',          finishesAtMs: 2620 },
  { id: 'telemetry',    label: 'telemetry · 1.6 s tick',    detail: 'fast-path lanes · 5/5',        finishesAtMs: 2820 },
  { id: 'cockpit',      label: 'cockpit / hud composer',    detail: '4 themes · widgets ready',     finishesAtMs: 3050 },
];

/** Compute the per-system progress at time `tMs` since launch start. Each
 *  system uses an ease-out curve from queued (no progress) to ready
 *  (clamped at 1.0). The system list is stable across renders. */
export function computeBootSystems(tMs: number): BootSystem[] {
  return RAW_SYSTEMS.map((s) => {
    const startMs = Math.max(0, s.finishesAtMs - 360);
    const endMs = s.finishesAtMs;
    const raw = (tMs - startMs) / Math.max(1, endMs - startMs);
    const eased = raw <= 0 ? 0 : raw >= 1 ? 1 : 1 - Math.pow(1 - raw, 2.4);
    const progress = Math.max(0, Math.min(1, eased));
    const phase: SystemPhase = progress >= 1 ? 'ready' : progress > 0.05 ? 'loading' : 'queued';
    return { ...s, progress, phase };
  });
}

/** Deterministic but seemingly-random log line generator. Each call produces
 *  a single line that includes one of the BOOT_TEMPLATES with substituted
 *  values. The output deliberately mixes kernel-style messages, k8s API
 *  events, and security-platform events so the right rail reads as a true
 *  multi-subsystem boot dump. */
export interface BootLogLine {
  id: string;
  timestampMs: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  source: string;
  message: string;
}

const BOOT_TEMPLATES: Array<(seed: number) => Pick<BootLogLine, 'level' | 'source' | 'message'>> = [
  (s) => ({ level: 'info', source: 'kernel',    message: `bringing up loop${s % 4} on cpu${s % 16}` }),
  (s) => ({ level: 'ok',   source: 'kubelet',   message: `node-${(s % 5) + 1} : registered with apiserver` }),
  (s) => ({ level: 'info', source: 'etcd',      message: `raft.${s % 4} : entered follower state · term ${100 + (s % 30)}` }),
  (s) => ({ level: 'ok',   source: 'cilium',    message: `endpoint ${(s * 17) % 9999} : policy ingress=allow egress=allow` }),
  (s) => ({ level: 'info', source: 'kubeapi',   message: `Watch close - registered/v1/services - 0 - hostname:443/api/v1/services?... ` }),
  (s) => ({ level: 'ok',   source: 'kubevirt',  message: `vmi/payments-vm-0${(s % 4) + 1} : VirtualMachineInstance ready` }),
  (s) => ({ level: 'info', source: 'longhorn',  message: `volume pvc-${(s * 31).toString(16).padStart(8, '0')} : healthy 3/3 replicas` }),
  (s) => ({ level: 'info', source: 'falco',     message: `loading rule ${(s % 18) + 1}/18 · NXR-00${(s % 80).toString().padStart(2, '0')}` }),
  (s) => ({ level: 'ok',   source: 'tetragon',  message: `tracing-policy applied · sensor.id=${1 + (s % 5)}` }),
  (s) => ({ level: 'info', source: 'wazuh',     message: `agent ${(s % 8) + 1}/8 · enrolling host=cp-0${(s % 3) + 1}` }),
  (s) => ({ level: 'ok',   source: 'argocd',    message: `Application/${['payments','ledger','fraud','argocd'][s % 4]}-api : Synced · Healthy` }),
  (s) => ({ level: 'warn', source: 'kernel',    message: `cgroup: cgroup-v2 : memory.high=80% on workload.slice` }),
  (s) => ({ level: 'info', source: 'spdk',      message: `nvmf_tgt : opened qpair ${s} cores=${s % 16}` }),
  (s) => ({ level: 'info', source: 'opensearch', message: `cluster.${s % 3} : status=GREEN · primaries=84 · replicas=84` }),
  (s) => ({ level: 'ok',   source: 'kube-bench', message: `5.${(s % 9) + 1}.${(s * 7) % 16} : PASS · cis-k8s control` }),
  (s) => ({ level: 'info', source: 'misp',      message: `feed.threatfox : pulled ${1200 + (s * 31) % 800} new ioc` }),
];

let LINE_SEQ = 0;

export function nextBootLogLine(timestampMs: number): BootLogLine {
  const t = BOOT_TEMPLATES[LINE_SEQ % BOOT_TEMPLATES.length];
  const seed = LINE_SEQ;
  LINE_SEQ += 1;
  const partial = t(seed);
  return {
    id: `${timestampMs.toFixed(0)}-${seed}`,
    timestampMs,
    ...partial,
  };
}

/** Reset for tests. */
export function _resetLogSequence(): void {
  LINE_SEQ = 0;
}

/** Convenience hook helpers for the variants. */
export const BOOT_DURATION_MS = 3200;
export const LOG_TICK_MS = 80;

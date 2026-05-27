import { useEffect, useRef, useState } from 'react';

export interface EnvironmentSnapshot {
  /** Total monitored workloads (vm + lxc + pod + docker) across the synthetic environment */
  totalWorkloads: number;
  /** Aggregate cluster-wide IOPS measured across all storage backends */
  totalIops: number;
  /** Aggregate cluster-wide ingress throughput in Mb/s across NIC bonds */
  ingressMbps: number;
  /** Aggregate cluster-wide egress throughput in Mb/s across NIC bonds */
  egressMbps: number;
  /** Live cluster CPU utilization percent (rolling average) */
  cpuPercent: number;
  /** Live DRAM utilization percent (rolling average) */
  ramPercent: number;
  /** Live aggregate watts drawn by all nodes */
  watts: number;
  /** Active live migrations in-flight */
  activeMigrations: number;
  /** Open critical CVEs across the cluster */
  openCves: number;
  /** Cluster trust score 0-100; security posture metric */
  trustScore: number;
  /** Rolling deltas vs previous tick (positive or negative) */
  deltas: {
    totalWorkloads: number;
    totalIops: number;
    ingressMbps: number;
    egressMbps: number;
    cpuPercent: number;
    ramPercent: number;
    watts: number;
    activeMigrations: number;
  };
  /** Monotonic tick counter; useful as a React key for forcing flash classes */
  tick: number;
  /** Per-fast-path-lane snapshot (SPDK / DPDK / vhost-user / RDMA / hugepages).
   *  Each lane carries its own queue depth, drop count, IRQ rate and IOPS. */
  fastPathLanes: FastPathLaneSample[];
  /** Per-service request-rate sample for the four canonical critical services
   *  Mission Control already shows on its API-rate panel. Used by the
   *  SLO burn-rate gauge to compute multi-window burn. */
  serviceSamples: ServiceLevelSample[];
}

export type FastPathLaneId = 'spdk' | 'dpdk' | 'vhost-user' | 'rdma' | 'hugepages';

export interface FastPathLaneSample {
  id: FastPathLaneId;
  /** Display name. */
  label: string;
  /** Live queue depth — bursts indicate the lane is becoming a bottleneck. */
  queueDepth: number;
  /** Maximum queue depth at which the lane is considered fully backed-up. */
  queueCapacity: number;
  /** Packet/IO drops in the last tick. */
  drops: number;
  /** IRQ or polled-mode wakeup rate per second. */
  irqRate: number;
  /** IO operations per second sustained on this lane. */
  iops: number;
}

export type ServiceId = 'payments-api' | 'ledger-svc' | 'fraud-detect' | 'argocd-api';

export interface ServiceLevelSample {
  id: ServiceId;
  /** Sampled current request rate. */
  requestsPerSec: number;
  /** Errors observed in the last sample window. */
  errorsLastSample: number;
  /** Total error budget for the SLO window (e.g. 0.001 = 99.9% SLO over a month). */
  errorBudgetTotal: number;
  /** How much of that budget is consumed this sample (between 0 and 1). */
  errorBudgetConsumed: number;
}

const BASE_SNAPSHOT: Omit<EnvironmentSnapshot, 'deltas' | 'tick' | 'fastPathLanes' | 'serviceSamples'> = {
  totalWorkloads: 642,
  totalIops: 1_120_000,
  ingressMbps: 78_420,
  egressMbps: 74_840,
  cpuPercent: 58,
  ramPercent: 64,
  watts: 1_592,
  activeMigrations: 3,
  openCves: 17,
  trustScore: 87,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drift(value: number, amplitude: number, min: number, max: number): number {
  const delta = (Math.random() * 2 - 1) * amplitude;
  return Math.round(clamp(value + delta, min, max));
}

const FAST_PATH_LANE_BASE: FastPathLaneSample[] = [
  { id: 'spdk', label: 'SPDK', queueDepth: 12, queueCapacity: 64, drops: 0, irqRate: 142_000, iops: 480_000 },
  { id: 'dpdk', label: 'DPDK', queueDepth: 18, queueCapacity: 64, drops: 1, irqRate: 198_000, iops: 312_000 },
  { id: 'vhost-user', label: 'VHOST', queueDepth: 9, queueCapacity: 48, drops: 0, irqRate: 88_000, iops: 142_000 },
  { id: 'rdma', label: 'RDMA', queueDepth: 14, queueCapacity: 96, drops: 0, irqRate: 240_000, iops: 612_000 },
  { id: 'hugepages', label: '1G HUGE', queueDepth: 4, queueCapacity: 32, drops: 0, irqRate: 12_000, iops: 0 },
];

const SERVICE_BASE: ServiceLevelSample[] = [
  { id: 'payments-api', requestsPerSec: 1_840, errorsLastSample: 2, errorBudgetTotal: 1.0, errorBudgetConsumed: 0.18 },
  { id: 'ledger-svc', requestsPerSec: 920, errorsLastSample: 1, errorBudgetTotal: 1.0, errorBudgetConsumed: 0.09 },
  { id: 'fraud-detect', requestsPerSec: 1_640, errorsLastSample: 8, errorBudgetTotal: 1.0, errorBudgetConsumed: 0.62 },
  { id: 'argocd-api', requestsPerSec: 48, errorsLastSample: 0, errorBudgetTotal: 1.0, errorBudgetConsumed: 0.04 },
];

function nextLanes(prev: FastPathLaneSample[] | undefined): FastPathLaneSample[] {
  const base = prev ?? FAST_PATH_LANE_BASE;
  return base.map((lane) => ({
    ...lane,
    queueDepth: drift(lane.queueDepth, 6, 0, lane.queueCapacity),
    drops: Math.max(0, drift(lane.drops, 1, 0, 12)),
    irqRate: drift(lane.irqRate, lane.irqRate * 0.06, lane.irqRate * 0.6, lane.irqRate * 1.4),
    iops: drift(lane.iops, lane.iops * 0.08, lane.iops * 0.5, lane.iops * 1.5),
  }));
}

/** Per-service equilibrium error-budget consumption — the drift is anchored
 *  to these targets so each service shows a stable severity bucket
 *  (healthy / ticket / page) instead of all four collapsing to critical. */
const SERVICE_ANCHOR: Record<ServiceId, number> = {
  'argocd-api': 0.08,    // healthy
  'ledger-svc': 0.18,    // healthy
  'payments-api': 0.55,  // ticket
  'fraud-detect': 0.95,  // page (right at the threshold)
};

function nextServiceSamples(prev: ServiceLevelSample[] | undefined): ServiceLevelSample[] {
  const base = prev ?? SERVICE_BASE;
  return base.map((s) => {
    const errorsLastSample = Math.max(0, drift(s.errorsLastSample, 1, 0, 8));
    // Anchor + small noise. Errors push the consumption up, no-error ticks
    // slowly bleed it back toward the anchor.
    const anchor = SERVICE_ANCHOR[s.id] ?? 0.2;
    const restoration = (anchor - s.errorBudgetConsumed) * 0.18;
    const errorPush = errorsLastSample > 3 ? (errorsLastSample - 3) * 0.02 : 0;
    const noise = (Math.random() * 2 - 1) * 0.03;
    return {
      ...s,
      requestsPerSec: drift(s.requestsPerSec, s.requestsPerSec * 0.08, s.requestsPerSec * 0.4, s.requestsPerSec * 1.6),
      errorsLastSample,
      errorBudgetConsumed: clamp(s.errorBudgetConsumed + restoration + errorPush + noise, 0, 1.6),
    };
  });
}

export function nextSnapshot(prev?: EnvironmentSnapshot): EnvironmentSnapshot {
  const seed = prev ?? {
    ...BASE_SNAPSHOT,
    deltas: { totalWorkloads: 0, totalIops: 0, ingressMbps: 0, egressMbps: 0, cpuPercent: 0, ramPercent: 0, watts: 0, activeMigrations: 0 },
    tick: 0,
    fastPathLanes: FAST_PATH_LANE_BASE,
    serviceSamples: SERVICE_BASE,
  };
  const totalWorkloads = drift(seed.totalWorkloads, 12, 580, 720);
  const totalIops = drift(seed.totalIops, 36_000, 880_000, 1_400_000);
  const ingressMbps = drift(seed.ingressMbps, 4_200, 50_000, 110_000);
  const egressMbps = drift(seed.egressMbps, 4_000, 48_000, 105_000);
  const cpuPercent = drift(seed.cpuPercent, 5, 38, 86);
  const ramPercent = drift(seed.ramPercent, 4, 44, 88);
  const watts = drift(seed.watts, 38, 1_320, 1_840);
  const activeMigrations = drift(seed.activeMigrations, 1, 0, 9);

  return {
    totalWorkloads,
    totalIops,
    ingressMbps,
    egressMbps,
    cpuPercent,
    ramPercent,
    watts,
    activeMigrations,
    openCves: seed.openCves,
    trustScore: seed.trustScore,
    deltas: {
      totalWorkloads: totalWorkloads - seed.totalWorkloads,
      totalIops: totalIops - seed.totalIops,
      ingressMbps: ingressMbps - seed.ingressMbps,
      egressMbps: egressMbps - seed.egressMbps,
      cpuPercent: cpuPercent - seed.cpuPercent,
      ramPercent: ramPercent - seed.ramPercent,
      watts: watts - seed.watts,
      activeMigrations: activeMigrations - seed.activeMigrations,
    },
    tick: seed.tick + 1,
    fastPathLanes: nextLanes(seed.fastPathLanes),
    serviceSamples: nextServiceSamples(seed.serviceSamples),
  };
}

/**
 * React hook that emits a fresh environment snapshot on a configurable interval.
 * Each tick perturbs the previous values within bounded ranges so the dashboards
 * appear to be monitoring a live environment.
 */
export function useLiveTelemetry(intervalMs: number = 1600): EnvironmentSnapshot {
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot>(() => nextSnapshot());
  const intervalRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    intervalRef.current = window.setInterval(() => {
      setSnapshot((prev) => nextSnapshot(prev));
    }, intervalMs);
    return () => {
      if (intervalRef.current !== undefined) window.clearInterval(intervalRef.current);
    };
  }, [intervalMs]);

  return snapshot;
}

export function formatNumber(value: number, opts: { compact?: boolean; suffix?: string } = {}): string {
  const { compact, suffix } = opts;
  let formatted: string;
  if (compact) {
    if (value >= 1_000_000) formatted = `${(value / 1_000_000).toFixed(2)}M`;
    else if (value >= 1_000) formatted = `${(value / 1_000).toFixed(1)}K`;
    else formatted = String(value);
  } else {
    formatted = value.toLocaleString();
  }
  return suffix ? `${formatted}${suffix}` : formatted;
}

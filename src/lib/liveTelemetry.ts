import { useEffect, useRef, useState } from 'react';
import { demoAcceleratorSummary, type EnvironmentAcceleratorSummary } from './telemetry/hardwareAddOn';
import { demoStorageIops, type EnvironmentStorageIops } from './telemetry/storageIops';

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
  /**
   * Metrics the node could not measure on this tick. Numeric fields are still
   * populated (with 0) so existing chart maths keep working, but anything
   * listed here must render as "unavailable" rather than as a real reading.
   * Empty or absent in demo mode, where every value is synthetic by design.
   */
  unavailableMetrics?: string[];
  /** Per-metric provenance from the BFF, e.g. `{ cpu: 'metrics-server' }`. */
  metricSources?: Record<string, string>;
  /** FPGA / GPU / NPU / TPU pulse collected with CPU / RAM. */
  accelerators?: EnvironmentAcceleratorSummary;
  /** Per-disk IOPS collected with CPU / RAM. */
  storageIops?: EnvironmentStorageIops;
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
}

const BASE_SNAPSHOT: Omit<EnvironmentSnapshot, 'deltas' | 'tick'> = {
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
  accelerators: demoAcceleratorSummary(),
  storageIops: demoStorageIops(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drift(value: number, amplitude: number, min: number, max: number): number {
  const delta = (Math.random() * 2 - 1) * amplitude;
  return Math.round(clamp(value + delta, min, max));
}

export function nextSnapshot(prev?: EnvironmentSnapshot): EnvironmentSnapshot {
  const seed = prev ?? { ...BASE_SNAPSHOT, deltas: { totalWorkloads: 0, totalIops: 0, ingressMbps: 0, egressMbps: 0, cpuPercent: 0, ramPercent: 0, watts: 0, activeMigrations: 0 }, tick: 0 };
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
    accelerators: seed.accelerators ?? demoAcceleratorSummary(),
    storageIops: seed.storageIops ?? demoStorageIops(),
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

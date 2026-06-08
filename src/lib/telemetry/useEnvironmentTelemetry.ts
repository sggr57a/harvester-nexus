import { useCallback, useEffect, useRef, useState } from 'react';
import { nextSnapshot, type EnvironmentSnapshot } from '../liveTelemetry';
import { payloadToEnvironmentSnapshot } from './environmentAdapter';
import { fetchEnvironmentTelemetry, fetchLiveHealth } from './harvesterClient';
import {
  readStoredTelemetryMode,
  resolveTelemetryMode,
  type TelemetryMode,
  type TelemetryState,
  writeStoredTelemetryMode,
} from './mode';

const DEFAULT_INTERVAL_MS = 1600;

export interface UseEnvironmentTelemetryResult {
  snapshot: EnvironmentSnapshot;
  telemetry: TelemetryState;
  setRequestedMode: (mode: TelemetryMode) => void;
  refresh: () => void;
}

export function useEnvironmentTelemetry(intervalMs: number = DEFAULT_INTERVAL_MS): UseEnvironmentTelemetryResult {
  const [requestedMode, setRequestedModeState] = useState<TelemetryMode>(() => readStoredTelemetryMode());
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [clusterReady, setClusterReady] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot>(() => nextSnapshot());
  const demoSnapshotRef = useRef<EnvironmentSnapshot>(nextSnapshot());
  const liveSnapshotRef = useRef<EnvironmentSnapshot | undefined>(undefined);
  const resolvedMode = resolveTelemetryMode(requestedMode, liveAvailable);

  const setRequestedMode = useCallback((mode: TelemetryMode) => {
    setRequestedModeState(mode);
    writeStoredTelemetryMode(mode);
  }, []);

  const probeLive = useCallback(async () => {
    const health = await fetchLiveHealth();
    const available = health?.live === true;
    setLiveAvailable(available);
    setClusterReady(health?.clusterReady === true);
    setMonitoringEnabled(health?.monitoringEnabled === true);
    setMessage(health?.message);
    return available;
  }, []);

  const pullLive = useCallback(async () => {
    const payload = await fetchEnvironmentTelemetry();
    if (!payload) {
      setLiveAvailable(false);
      setMessage('Cluster metrics API unavailable — using demo telemetry');
      return false;
    }
    const next = payloadToEnvironmentSnapshot(payload, liveSnapshotRef.current);
    liveSnapshotRef.current = next;
    setClusterReady(payload.clusterReady);
    setMonitoringEnabled(payload.monitoringEnabled);
    setSnapshot(next);
    setLiveAvailable(true);
    setMessage(undefined);
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (requestedMode === 'demo') {
      demoSnapshotRef.current = nextSnapshot(demoSnapshotRef.current);
      setSnapshot(demoSnapshotRef.current);
      return;
    }

    const available = await probeLive();
    const useLive = requestedMode === 'live' ? available : available && requestedMode === 'auto';

    if (useLive) {
      const ok = await pullLive();
      if (!ok && requestedMode === 'auto') {
        demoSnapshotRef.current = nextSnapshot(demoSnapshotRef.current);
        setSnapshot(demoSnapshotRef.current);
      }
      return;
    }

    if (requestedMode === 'live' && !available) {
      setMessage('Live mode requested but cluster API unreachable — showing demo data');
    }
    demoSnapshotRef.current = nextSnapshot(demoSnapshotRef.current);
    setSnapshot(demoSnapshotRef.current);
  }, [probeLive, pullLive, requestedMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, refresh]);

  return {
    snapshot,
    telemetry: {
      mode: resolvedMode,
      requested: requestedMode,
      liveAvailable,
      clusterReady,
      message,
    },
    setRequestedMode,
    refresh,
  };
}

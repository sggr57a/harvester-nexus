import { useCallback, useEffect, useState } from 'react';
import { buildClusterDashboardBundle, type TelemetryDataSource } from './dashboardAdapters';
import type { DashboardTelemetryPayload } from './dashboardTypes';
import { fetchDashboardTelemetry } from './harvesterClient';
import type { TelemetryState } from './mode';

const DEFAULT_INTERVAL_MS = 1600;

export function useClusterDashboards(telemetry: TelemetryState, intervalMs: number = DEFAULT_INTERVAL_MS) {
  const [payload, setPayload] = useState<DashboardTelemetryPayload | null>(null);
  const dataSource: TelemetryDataSource = telemetry.mode === 'live' ? 'live' : 'demo';
  const useLive = dataSource === 'live';

  const refresh = useCallback(async () => {
    if (!useLive) {
      setPayload(null);
      return;
    }
    const next = await fetchDashboardTelemetry();
    setPayload(next);
  }, [useLive]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    void refresh();
    if (!useLive) return undefined;
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, refresh, useLive]);

  return buildClusterDashboardBundle(useLive ? payload : null, dataSource);
}

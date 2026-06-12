import { useCallback, useEffect, useState } from 'react';
import type { TelemetryState } from '../telemetry/mode';
import { buildDemoDashboard, buildDemoResourceList } from './harvesterResourceCatalog';
import { fetchHarvesterDashboard, fetchHarvesterResourceList } from './harvesterSteveClient';
import type { HarvesterDashboardPayload, HarvesterResourceListPayload, HarvesterResourceType } from './harvesterTypes';

export interface HarvesterResourceState {
  loading: boolean;
  list: HarvesterResourceListPayload;
  dashboard: HarvesterDashboardPayload;
}

function demoList(type: HarvesterResourceType): HarvesterResourceListPayload {
  return buildDemoResourceList(type);
}

function demoDashboard(): HarvesterDashboardPayload {
  return buildDemoDashboard();
}

export function useHarvesterResources(
  type: HarvesterResourceType,
  telemetry: TelemetryState,
  refreshMs = 8000,
): HarvesterResourceState {
  const preferLive = telemetry.mode === 'live';
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<HarvesterResourceListPayload>(() => demoList(type));
  const [dashboard, setDashboard] = useState<HarvesterDashboardPayload>(() => demoDashboard());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (preferLive) {
        const [liveList, liveDash] = await Promise.all([
          fetchHarvesterResourceList(type),
          fetchHarvesterDashboard(),
        ]);
        if (liveList) {
          setList(liveList);
        } else {
          setList({ ...demoList(type), dataSource: 'demo' });
        }
        if (liveDash) {
          setDashboard(liveDash);
        }
      } else {
        setList(demoList(type));
        setDashboard(demoDashboard());
      }
    } finally {
      setLoading(false);
    }
  }, [preferLive, type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(timer);
  }, [refresh, refreshMs]);

  return { loading, list, dashboard };
}

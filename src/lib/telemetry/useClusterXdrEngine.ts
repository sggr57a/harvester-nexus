import { useMemo } from 'react';
import { useLiveXdrEngine } from '../xdr/hooks';
import type { MachineRow } from '../dashboards';
import { endpointsFromMachineFleet } from '../xdr/engine';
import { liveEventsToSensorEvents } from '../xdr/liveEvents';
import type { LiveXdrSlice } from './dashboardTypes';
import type { TelemetryState } from './mode';

export function useClusterXdrEngine(
  telemetry: TelemetryState,
  xdrLive?: LiveXdrSlice,
  fleet?: MachineRow[],
) {
  const isDemo = telemetry.mode === 'demo';
  const sensorsLive =
    !isDemo && xdrLive?.deployed === true && (xdrLive.sensorsHealthy ?? 0) > 0;
  const simulate = isDemo;

  const seedEndpoints = useMemo(
    () => (isDemo ? undefined : endpointsFromMachineFleet(fleet ?? [])),
    [isDemo, fleet],
  );

  const ingestEvents = useMemo(
    () => (!isDemo && xdrLive?.events?.length ? liveEventsToSensorEvents(xdrLive.events) : undefined),
    [isDemo, xdrLive?.events],
  );

  const snap = useLiveXdrEngine({
    intervalMs: 1600,
    simulate,
    loop: isDemo,
    useDemoInventory: isDemo,
    seedEndpoints,
    ingestEvents,
  });

  return { snap, simulate, sensorsLive, isDemo };
}

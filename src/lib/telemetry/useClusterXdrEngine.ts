import { useMemo } from 'react';
import { useLiveXdrEngine } from '../xdr/hooks';
import type { SensorEvent } from '../xdr/types';
import type { LiveXdrSlice } from './dashboardTypes';
import type { TelemetryState } from './mode';

function k8sEventsToSensorEvents(events: LiveXdrSlice['events']): SensorEvent[] {
  const now = Date.now();
  return events.map((event, index) => ({
    id: `k8s-${event.namespace}-${event.name}-${index}`,
    source: 'kubernetes-audit',
    endpointId: event.namespace || 'cluster',
    kind: 'kube-api',
    timestampMs: now - index * 1000,
    payload: { message: event.message },
    sensorSeverity: 'medium',
  }));
}

export function useClusterXdrEngine(telemetry: TelemetryState, xdrLive?: LiveXdrSlice) {
  const sensorsLive =
    telemetry.mode === 'live' && xdrLive?.deployed === true && (xdrLive.sensorsHealthy ?? 0) > 0;
  const simulate = !sensorsLive;

  const ingestEvents = useMemo(
    () => (sensorsLive && xdrLive?.events?.length ? k8sEventsToSensorEvents(xdrLive.events) : undefined),
    [sensorsLive, xdrLive?.events],
  );

  const snap = useLiveXdrEngine({
    intervalMs: 1600,
    simulate,
    loop: !sensorsLive,
    ingestEvents,
  });

  return { snap, simulate, sensorsLive };
}

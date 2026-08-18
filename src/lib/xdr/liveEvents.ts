/**
 * Map cockpit XDR ingest payloads onto the engine's SensorEvent shape.
 *
 * Live events already carry the sensor-assigned severity. Kubernetes
 * Warning events (the previous-only ingest path) derive severity from the
 * reason/message — they are never all forced to ``medium``.
 */

import type { LiveXdrEvent } from '../telemetry/dashboardTypes';
import type { EventKind, EventSource, SensorEvent, Severity } from './types';

const SEVERITIES: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
const KINDS: readonly EventKind[] = [
  'process-exec',
  'file-open',
  'file-write',
  'network-connect',
  'dns-query',
  'syscall',
  'auth',
  'image-pull',
  'kube-api',
  'config-change',
  'cve-detected',
  'compliance-check',
  'honeypot-touch',
  'ids-signature',
];
const SOURCES: readonly EventSource[] = [
  'falco',
  'tetragon',
  'wazuh-agent',
  'wazuh-manager',
  'trivy',
  'grype',
  'syft',
  'suricata',
  'hubble',
  'opensearch',
  'misp',
  'kube-bench',
  'kube-hunter',
  'polaris',
  'opencanary',
  'openscap',
  'lynis',
  'simulator',
  'kubernetes-audit',
  'auditd',
];

const HIGH_REASONS = /oom|failed$|failedmount|failedcreate|evicted|not-ready/i;
const MEDIUM_REASONS = /backoff|unhealthy|failedscheduling|killing|networknotready/i;

export function severityFromK8sWarning(reason: string, message = ''): Severity {
  const blob = `${reason} ${message}`;
  if (HIGH_REASONS.test(blob) || /oom/i.test(blob)) return 'high';
  if (MEDIUM_REASONS.test(blob)) return 'medium';
  return 'low';
}

function asSeverity(value: unknown, fallback: Severity): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : fallback;
}

function asKind(value: unknown, fallback: EventKind): EventKind {
  return KINDS.includes(value as EventKind) ? (value as EventKind) : fallback;
}

function asSource(value: unknown, fallback: EventSource): EventSource {
  return SOURCES.includes(value as EventSource) ? (value as EventSource) : fallback;
}

export function liveEventToSensorEvent(event: LiveXdrEvent, index = 0): SensorEvent {
  const message = event.message ?? String(event.payload?.message ?? '');
  const reason = String(event.payload?.reason ?? '');
  const isLegacyK8s = !event.source || event.source === 'kubernetes-audit' || (!event.sensorSeverity && !event.kind);
  const derived = severityFromK8sWarning(reason, message);
  const source = asSource(event.source, 'kubernetes-audit');
  const kind = asKind(event.kind, source === 'kubernetes-audit' ? 'kube-api' : 'syscall');
  const sensorSeverity = event.sensorSeverity
    ? asSeverity(event.sensorSeverity, derived)
    : isLegacyK8s
      ? derived
      : asSeverity(undefined, 'info');

  return {
    id: event.id || `${source}-${event.namespace ?? 'cluster'}-${event.name ?? index}`,
    source,
    endpointId: event.endpointId || event.namespace || event.name || 'cluster',
    kind,
    timestampMs: event.timestampMs || Date.now() - index * 1000,
    payload: {
      message,
      ...(event.payload ?? {}),
    },
    process: event.process,
    remoteIp: event.remoteIp,
    remoteHost: event.remoteHost,
    hash: event.hash,
    sensorSeverity,
  };
}

export function liveEventsToSensorEvents(events: LiveXdrEvent[] | undefined): SensorEvent[] {
  if (!events?.length) return [];
  return events.map((event, index) => liveEventToSensorEvent(event, index));
}

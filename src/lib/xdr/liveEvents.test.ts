import { describe, expect, it } from 'vitest';
import { liveEventToSensorEvent, liveEventsToSensorEvents, severityFromK8sWarning } from './liveEvents';
import type { LiveXdrEvent } from '../telemetry/dashboardTypes';

describe('severityFromK8sWarning', () => {
  it('does not collapse every warning to medium', () => {
    expect(severityFromK8sWarning('OOMKilling', 'Memory cgroup out of memory')).toBe('high');
    expect(severityFromK8sWarning('BackOff', 'Back-off restarting failed container')).toBe('medium');
    expect(severityFromK8sWarning('Pulling', 'Pulling image')).toBe('low');
    expect(new Set(['high', 'medium', 'low']).size).toBe(3);
  });
});

describe('liveEventToSensorEvent', () => {
  it('preserves Falco / Suricata / Wazuh severity instead of forcing medium', () => {
    const falco = liveEventToSensorEvent({
      id: 'falco-1',
      source: 'falco',
      endpointId: 'payments',
      kind: 'process-exec',
      timestampMs: 1,
      sensorSeverity: 'critical',
      process: 'nmap',
      payload: { rule: 'Write below binary dir' },
      message: 'exec nmap',
    });
    const suricata = liveEventToSensorEvent({
      id: 'suri-1',
      source: 'suricata',
      kind: 'ids-signature',
      sensorSeverity: 'high',
      remoteIp: '203.0.113.61',
      payload: { signature: 'ET SCAN port scan from external' },
      message: 'port scan',
    });
    const wazuh = liveEventToSensorEvent({
      id: 'wazuh-1',
      source: 'wazuh-manager',
      kind: 'auth',
      sensorSeverity: 'low',
      payload: { level: 5, description: 'sshd authentication success' },
      message: 'sshd authentication success',
    });
    expect(falco.sensorSeverity).toBe('critical');
    expect(suricata.sensorSeverity).toBe('high');
    expect(wazuh.sensorSeverity).toBe('low');
    expect(new Set([falco.sensorSeverity, suricata.sensorSeverity, wazuh.sensorSeverity]).size).toBe(3);
  });

  it('derives Kubernetes warning severity from the reason', () => {
    const events: LiveXdrEvent[] = [
      { source: 'kubernetes-audit', kind: 'kube-api', message: 'Memory cgroup out of memory', payload: { reason: 'OOMKilling' }, namespace: 'default', name: 'app' },
      { source: 'kubernetes-audit', kind: 'kube-api', message: 'Back-off restarting', payload: { reason: 'BackOff' }, namespace: 'default', name: 'app' },
    ];
    const mapped = liveEventsToSensorEvents(events);
    expect(mapped[0].sensorSeverity).toBe('high');
    expect(mapped[1].sensorSeverity).toBe('medium');
    expect(mapped.every((event) => event.sensorSeverity === 'medium')).toBe(false);
  });
});

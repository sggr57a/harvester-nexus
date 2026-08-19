/**
 * Parser contract tests for installer/overlay/usr/lib/nexus/xdr_ingest.py.
 *
 * These exercise the log-line parsers against real Falco / Tetragon /
 * Suricata / Wazuh JSON shapes so severity cannot collapse to a hardcoded
 * ``medium`` again without breaking the suite.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/xdr_ingest.py');

function py<T>(snippet: string): T {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location("x", ${JSON.stringify(MODULE)})`,
    'x = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(x)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8' });
  return JSON.parse(out) as T;
}

const FALCO = JSON.stringify({
  output: 'Warning File below binary dir opened for writing (user=root command=touch /bin/pwned)',
  priority: 'Critical',
  rule: 'Write below binary dir',
  time: '2026-08-18T19:00:00.000000000Z',
  output_fields: {
    'k8s.ns.name': 'default',
    'k8s.pod.name': 'payments',
    'proc.name': 'touch',
    'fd.name': '/bin/pwned',
    'evt.type': 'open',
  },
});

const TETRAGON = JSON.stringify({
  time: '2026-08-18T19:00:01Z',
  process_exec: {
    process: {
      binary: '/usr/bin/nmap',
      pod: { namespace: 'tenant-apps', name: 'recon' },
    },
  },
});

const SURICATA = JSON.stringify({
  timestamp: '2026-08-18T19:00:02.000000+0000',
  event_type: 'alert',
  src_ip: '203.0.113.61',
  dest_ip: '10.10.20.10',
  dest_port: 22,
  alert: { signature: 'ET SCAN Nmap Scripting Engine User-Agent Detected', severity: 1, signature_id: 2013028 },
});

const WAZUH = JSON.stringify({
  timestamp: '2026-08-18T19:00:03.000Z',
  rule: { id: '5715', level: 3, description: 'sshd: authentication success.', groups: ['syslog', 'sshd', 'authentication_success'] },
  agent: { name: 'compute-01' },
  data: { srcip: '10.0.0.9' },
});

describe('xdr_ingest parsers', () => {
  it('maps Falco priority, Suricata severity, and Wazuh level independently', () => {
    const result = py<{ falco: string; suricata: string; wazuh: string; tetragon: string }>(
      [
        `falco = x.parse_falco_line(${JSON.stringify(FALCO)})`,
        `tetragon = x.parse_tetragon_line(${JSON.stringify(TETRAGON)})`,
        `suricata = x.parse_suricata_line(${JSON.stringify(SURICATA)})`,
        `wazuh = x.parse_wazuh_line(${JSON.stringify(WAZUH)})`,
        'print(json.dumps({',
        '  "falco": falco["sensorSeverity"],',
        '  "tetragon": tetragon["sensorSeverity"],',
        '  "suricata": suricata["sensorSeverity"],',
        '  "wazuh": wazuh["sensorSeverity"],',
        '}))',
      ].join('\n'),
    );
    expect(result.falco).toBe('critical');
    expect(result.suricata).toBe('high');
    expect(result.wazuh).toBe('info');
    expect(result.tetragon).toBe('medium');
    expect(new Set(Object.values(result)).size).toBeGreaterThan(1);
  });

  it('tags sources so the engine can tell sensors apart', () => {
    const result = py<{ sources: string[]; kinds: string[] }>(
      [
        `events = [x.parse_falco_line(${JSON.stringify(FALCO)}), x.parse_tetragon_line(${JSON.stringify(TETRAGON)}), x.parse_suricata_line(${JSON.stringify(SURICATA)}), x.parse_wazuh_line(${JSON.stringify(WAZUH)})]`,
        'print(json.dumps({"sources": [e["source"] for e in events], "kinds": [e["kind"] for e in events]}))',
      ].join('\n'),
    );
    expect(result.sources).toEqual(['falco', 'tetragon', 'suricata', 'wazuh-manager']);
    expect(result.kinds).toContain('ids-signature');
    expect(result.kinds).toContain('process-exec');
  });

  it('derives Kubernetes warning severity from the reason, never a single default', () => {
    const result = py<{ high: string; medium: string; low: string }>(
      [
        'high = x.parse_k8s_warning({"reason": "OOMKilling", "message": "Memory cgroup out of memory", "metadata": {"namespace": "default", "name": "a"}, "involvedObject": {"name": "app"}})',
        'medium = x.parse_k8s_warning({"reason": "BackOff", "message": "Back-off restarting failed container", "metadata": {"namespace": "default", "name": "b"}})',
        'low = x.parse_k8s_warning({"reason": "Pulling", "message": "Pulling image", "metadata": {"namespace": "default", "name": "c"}})',
        'print(json.dumps({"high": high["sensorSeverity"], "medium": medium["sensorSeverity"], "low": low["sensorSeverity"]}))',
      ].join('\n'),
    );
    expect(result.high).toBe('high');
    expect(result.medium).toBe('medium');
    expect(result.low).toBe('low');
  });

  it('stable-hashes event ids so a poll does not mint a new id for the same alert', () => {
    const result = py<{ same: boolean }>(
      [
        `a = x.parse_falco_line(${JSON.stringify(FALCO)})`,
        `b = x.parse_falco_line(${JSON.stringify(FALCO)})`,
        'print(json.dumps({"same": a["id"] == b["id"]}))',
      ].join('\n'),
    );
    expect(result.same).toBe(true);
  });
});

describe('Oscilloscope / FftBars widgets', () => {
  it('do not add Math.random on top of live CH1/CH2/CH3 traces', () => {
    const widgets = readFileSync(
      resolve(__dirname, '../../src/components/dashboards/Widgets.tsx'),
      'utf8',
    );
    const oscilloscope = widgets.slice(
      widgets.indexOf('export function Oscilloscope'),
      widgets.indexOf('export function FftBars'),
    );
    const fft = widgets.slice(
      widgets.indexOf('export function FftBars'),
      widgets.indexOf('export function LatencyHistogram'),
    );
    expect(oscilloscope).not.toContain('Math.random');
    expect(fft).not.toContain('Math.random');
    expect(oscilloscope).toContain('CH1');
    expect(oscilloscope).toContain('CH2');
    expect(oscilloscope).toContain('CH3');
  });
});

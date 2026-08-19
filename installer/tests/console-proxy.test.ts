/**
 * Contract tests for installer/overlay/usr/lib/nexus/console_proxy.py.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/console_proxy.py');

function py<T>(snippet: string): T {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location("c", ${JSON.stringify(MODULE)})`,
    'c = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(c)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8' });
  return JSON.parse(out) as T;
}

describe('console_proxy', () => {
  it('uses the RFC 6455 WebSocket accept key', () => {
    const result = py<{ accept: string }>(
      'print(json.dumps({"accept": c.websocket_accept_key("dGhlIHNhbXBsZSBub25jZQ==")}))',
    );
    expect(result.accept).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('builds KubeVirt VNC and serial subresource paths', () => {
    const result = py<{ vnc: string; serial: string }>(
      [
        'print(json.dumps({',
        '  "vnc": c.kubevirt_subresource_path("vnc", "tenant-apps", "payments-vm"),',
        '  "serial": c.kubevirt_subresource_path("serial", "tenant-apps", "payments-vm"),',
        '}))',
      ].join('\n'),
    );
    expect(result.vnc).toBe(
      '/apis/subresources.kubevirt.io/v1/namespaces/tenant-apps/virtualmachineinstances/payments-vm/vnc',
    );
    expect(result.serial).toBe(
      '/apis/subresources.kubevirt.io/v1/namespaces/tenant-apps/virtualmachineinstances/payments-vm/console',
    );
  });

  it('rejects console names that look like flags or paths', () => {
    const result = py<{ flag: boolean; path: boolean; ok: boolean }>(
      [
        'def bad(value):',
        '    try:',
        '        c.validate_k8s_name(value)',
        '        return False',
        '    except ValueError:',
        '        return True',
        'print(json.dumps({"flag": bad("--namespace"), "path": bad("../etc"), "ok": c.validate_k8s_name("payments-vm") == "payments-vm"}))',
      ].join('\n'),
    );
    expect(result.flag).toBe(true);
    expect(result.path).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('round-trips a websocket text frame', () => {
    const result = py<{ payload: string; closed: boolean }>(
      [
        'frame = c.encode_ws_text(b"hello console", masked=True)',
        'buf = bytearray(frame)',
        'payloads, closed = c.decode_ws_frames(buf)',
        'print(json.dumps({"payload": payloads[0].decode(), "closed": closed}))',
      ].join('\n'),
    );
    expect(result.payload).toBe('hello console');
    expect(result.closed).toBe(false);
  });
});

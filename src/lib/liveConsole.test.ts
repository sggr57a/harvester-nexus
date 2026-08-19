import { describe, expect, it } from 'vitest';
import { buildConsolePath, consoleWebSocketUrl, isDns1123Label, liveConsoleKind } from './liveConsole';
import type { ConsoleChip, MachineRow } from './dashboards';

const vm: MachineRow = {
  id: 'vm-1',
  name: 'payments-vm',
  kind: 'vm',
  host: 'node-1',
  namespace: 'tenant-apps',
  cpuPercent: 10,
  ramGiB: 4,
  ramAllocGiB: 4,
  status: 'running',
  haEnabled: true,
  affinity: 'none',
};

const vncChip: ConsoleChip = {
  id: 'vm-1-vnc',
  type: 'novnc',
  target: 'payments-vm',
  machineId: 'vm-1',
  namespace: 'tenant-apps',
  kind: 'vm',
  state: 'idle',
};

describe('liveConsole', () => {
  it('builds a KubeVirt VNC websocket path', () => {
    expect(liveConsoleKind(vm, vncChip)).toBe('vnc');
    expect(buildConsolePath('vnc', 'tenant-apps', 'payments-vm')).toBe(
      '/api/v1/console/vnc?namespace=tenant-apps&name=payments-vm',
    );
    expect(
      consoleWebSocketUrl('serial', 'tenant-apps', 'payments-vm', { protocol: 'https:', host: 'nexus.example:8443' }),
    ).toBe('wss://nexus.example:8443/api/v1/console/serial?namespace=tenant-apps&name=payments-vm');
  });

  it('rejects names that could smuggle kubectl flags', () => {
    expect(isDns1123Label('--namespace')).toBe(false);
    expect(isDns1123Label('../etc')).toBe(false);
    expect(() => buildConsolePath('vnc', 'ok', '--foo')).toThrow(/invalid/);
  });

  it('uses kubectl exec for running pods', () => {
    const pod: MachineRow = { ...vm, kind: 'pod', name: 'api-green', id: 'pod-1' };
    const chip: ConsoleChip = { ...vncChip, type: 'xterm', id: 'pod-1-shell', kind: 'pod' };
    expect(liveConsoleKind(pod, chip)).toBe('exec');
  });
});

import type { ConsoleChip, MachineRow } from './dashboards';

export type LiveConsoleKind = 'vnc' | 'serial' | 'exec';

const NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export function isDns1123Label(value: string, maxLen = 63): boolean {
  return Boolean(value) && value.length <= maxLen && NAME_RE.test(value);
}

export function liveConsoleKind(machine: MachineRow, chip: ConsoleChip): LiveConsoleKind | null {
  if (machine.kind === 'vm' && machine.namespace && isDns1123Label(machine.namespace, 253) && isDns1123Label(machine.name)) {
    if (chip.type === 'novnc') return 'vnc';
    return 'serial';
  }
  if ((machine.kind === 'pod' || machine.kind === 'lxc' || machine.kind === 'docker') && machine.namespace) {
    if (isDns1123Label(machine.namespace, 253) && isDns1123Label(machine.name)) return 'exec';
  }
  return null;
}

export function buildConsolePath(kind: LiveConsoleKind, namespace: string, name: string): string {
  if (!isDns1123Label(namespace, 253) || !isDns1123Label(name)) {
    throw new Error('invalid console target');
  }
  const query = new URLSearchParams({ namespace, name });
  return `/api/v1/console/${kind}?${query.toString()}`;
}

export function consoleWebSocketUrl(
  kind: LiveConsoleKind,
  namespace: string,
  name: string,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${buildConsolePath(kind, namespace, name)}`;
}

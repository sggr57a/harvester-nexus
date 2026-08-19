import { describe, expect, it } from 'vitest';
import {
  consoleChipsForMachine,
  consolePresentationForProfile,
  describeConsole,
  preferredConsoleType,
  resolveGuestProfile,
} from './machineConsole';
import type { MachineRow } from './dashboards';

const linuxShellVm: MachineRow = {
  id: 'vm-1',
  name: 'app-server',
  kind: 'vm',
  host: 'node-1',
  cpuPercent: 20,
  ramGiB: 4,
  ramAllocGiB: 8,
  status: 'running',
  haEnabled: true,
  affinity: 'none',
  guestProfile: 'linux-shell',
  shell: 'bash',
};

const windowsVm: MachineRow = {
  ...linuxShellVm,
  id: 'vm-2',
  name: 'win-db',
  guestProfile: 'windows-desktop',
  desktopEnvironment: 'windows',
};

const xfceVm: MachineRow = {
  ...linuxShellVm,
  id: 'vm-3',
  name: 'desktop-dev',
  guestProfile: 'linux-desktop',
  desktopEnvironment: 'xfce',
};

describe('machineConsole', () => {
  it('uses graphical console for Windows VMs', () => {
    expect(consolePresentationForProfile('windows-desktop')).toBe('graphical');
    expect(preferredConsoleType(windowsVm)).toBe('novnc');
    const chips = consoleChipsForMachine(windowsVm);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.type).toBe('novnc');
    expect(describeConsole(windowsVm, 'novnc').presentation).toBe('graphical');
  });

  it('uses graphical console for Linux desktop VMs (xfce/kde)', () => {
    expect(preferredConsoleType(xfceVm)).toBe('novnc');
    expect(describeConsole(xfceVm, 'novnc').label).toContain('XFCE');
  });

  it('uses serial terminal for shell-only Linux VMs', () => {
    expect(preferredConsoleType(linuxShellVm)).toBe('serial');
    const chips = consoleChipsForMachine(linuxShellVm);
    expect(chips[0]?.type).toBe('serial');
    expect(describeConsole(linuxShellVm, 'serial').presentation).toBe('terminal');
  });

  it('uses xterm for running pods', () => {
    const pod: MachineRow = {
      ...linuxShellVm,
      id: 'pod-1',
      kind: 'pod',
      guestProfile: 'container-shell',
      shell: 'sh',
    };
    expect(resolveGuestProfile(pod)).toBe('container-shell');
    expect(consoleChipsForMachine(pod)[0]?.type).toBe('xterm');
  });
});

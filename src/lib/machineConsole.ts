import type { ConsoleChip, GuestProfile, MachineRow } from './dashboards';

export type ConsolePresentation = 'graphical' | 'terminal';

export interface ResolvedConsole {
  presentation: ConsolePresentation;
  label: string;
  chipType: ConsoleChip['type'];
  hint: string;
}

/** Windows and Linux desktop VMs use graphical (VNC); shell-only Linux uses serial/terminal. */
export function resolveGuestProfile(row: MachineRow): GuestProfile {
  if (row.guestProfile) return row.guestProfile;
  switch (row.kind) {
    case 'vm':
      return 'linux-shell';
    case 'pod':
    case 'lxc':
    case 'docker':
      return 'container-shell';
    default:
      return 'unknown';
  }
}

export function consolePresentationForProfile(profile: GuestProfile): ConsolePresentation {
  if (profile === 'windows-desktop' || profile === 'linux-desktop') return 'graphical';
  return 'terminal';
}

export function preferredConsoleType(row: MachineRow): ConsoleChip['type'] {
  const profile = resolveGuestProfile(row);
  if (consolePresentationForProfile(profile) === 'graphical') return 'novnc';
  if (row.kind === 'vm' || row.kind === 'node') return 'serial';
  return 'xterm';
}

export function describeConsole(row: MachineRow, chipType: ConsoleChip['type']): ResolvedConsole {
  const profile = resolveGuestProfile(row);
  const graphical = chipType === 'novnc' || consolePresentationForProfile(profile) === 'graphical';

  if (graphical) {
    const de = row.desktopEnvironment ?? (profile === 'windows-desktop' ? 'windows' : 'xfce');
    const label =
      de === 'windows'
        ? 'Graphical console (RDP/VNC)'
        : `${de.toUpperCase()} desktop session`;
    return {
      presentation: 'graphical',
      label,
      chipType: 'novnc',
      hint:
        profile === 'windows-desktop'
          ? 'Remote graphical session — Windows desktop via VNC/virt-viewer (Harvester/KubeVirt).'
          : 'Remote graphical session — Linux desktop environment via VNC.',
    };
  }

  const shell = row.shell ?? 'bash';
  if (chipType === 'serial' || row.kind === 'vm') {
    return {
      presentation: 'terminal',
      label: `Serial console (${shell})`,
      chipType: 'serial',
      hint: `Text console — ${shell} on ttyS0 (no desktop manager).`,
    };
  }

  return {
    presentation: 'terminal',
    label: `Shell (${shell})`,
    chipType: 'xterm',
    hint: `Interactive shell — kubectl exec / incus exec into ${row.kind}.`,
  };
}

/** Build Proxmox/Harvester-style console launchers for a workload row. */
export function consoleChipsForMachine(row: MachineRow): ConsoleChip[] {
  const profile = resolveGuestProfile(row);
  const chips: ConsoleChip[] = [];
  const base = {
    target: row.name,
    machineId: row.id,
    namespace: row.namespace,
    kind: row.kind,
    state: 'idle' as const,
  };

  if (row.kind === 'vm' && row.status === 'running') {
    if (consolePresentationForProfile(profile) === 'graphical') {
      chips.push({ id: `${row.id}-vnc`, type: 'novnc', ...base });
    } else {
      chips.push({ id: `${row.id}-serial`, type: 'serial', ...base });
    }
    return chips;
  }

  if ((row.kind === 'pod' || row.kind === 'lxc' || row.kind === 'docker') && row.status === 'running') {
    chips.push({ id: `${row.id}-shell`, type: 'xterm', ...base });
  }

  if (row.kind === 'node') {
    chips.push({ id: `${row.id}-serial`, type: 'serial', ...base });
  }

  return chips;
}

export function consoleChipsFromFleet(fleet: MachineRow[]): ConsoleChip[] {
  return fleet.flatMap((row) => consoleChipsForMachine(row));
}

export function storageVolumesForMachine(
  row: MachineRow,
  pvcs: { name: string; namespace: string; sizeGiB: number; storageClass: string }[],
): MachineRow['storageVolumes'] {
  if (row.storageVolumes?.length) return row.storageVolumes;
  if (!row.namespace) return [];
  return pvcs
    .filter((pvc) => pvc.namespace === row.namespace)
    .map((pvc) => ({
      name: pvc.name,
      sizeGiB: pvc.sizeGiB,
      storageClass: pvc.storageClass,
    }));
}

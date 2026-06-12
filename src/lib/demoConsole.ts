import type { GuestProfile, MachineRow } from './dashboards';
import { resolveGuestProfile } from './machineConsole';

/** Demo-only simulated shell — responds to basic commands for console preview. */
export function createDemoShellSession(row: MachineRow): {
  prompt: string;
  banner: string;
  handleLine: (line: string) => string[];
} {
  const profile = resolveGuestProfile(row);
  const shell = row.shell ?? 'bash';
  const host = row.name;
  const user = profile === 'container-shell' ? 'root' : 'nexus';
  const prompt = `${user}@${host}:~$ `;

  const banner = [
    `Nexus demo console — ${row.kind} · ${row.name}`,
    profile === 'linux-shell'
      ? `Serial/text session (${shell}) — no desktop environment.`
      : profile === 'container-shell'
        ? `Container shell (${shell}) via kubectl exec / incus exec.`
        : `Connected to ${host}.`,
    'Type "help" for commands. Live clusters use Harvester/KubeVirt VNC or kubectl exec.',
    '',
  ].join('\r\n');

  const handleLine = (line: string): string[] => {
    const cmd = line.trim();
    if (!cmd) return [];
    if (cmd === 'help') {
      return [
        'Available: help, ls, pwd, hostname, uname, df, ip addr, exit',
        'Demo only — real installs use virtctl console / kubectl exec.',
      ];
    }
    if (cmd === 'exit') return ['[session closed — close console panel to disconnect]'];
    if (cmd === 'ls') return ['bin  etc  home  lib  opt  usr  var'];
    if (cmd === 'pwd') return ['/home/nexus'];
    if (cmd === 'hostname') return [host];
    if (cmd === 'uname -a') {
      return [`Linux ${host} 6.8.0-harvester #1 SMP x86_64 GNU/Linux`];
    }
    if (cmd.startsWith('df')) {
      return [
        'Filesystem      Size  Used Avail Use% Mounted on',
        `/dev/vda1        32G  8.2G   24G  26% /`,
      ];
    }
    if (cmd.startsWith('ip')) {
      const ip = row.networks?.[0]?.ip ?? '10.42.0.12';
      return [
        `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450`,
        `    inet ${ip}/24 brd 10.42.0.255 scope global eth0`,
      ];
    }
    return [`${shell}: ${cmd}: command not found (demo)`];
  };

  return { prompt, banner, handleLine };
}

export interface DemoGraphicalSession {
  title: string;
  subtitle: string;
  profile: GuestProfile;
  desktopEnvironment: string;
}

export function createDemoGraphicalSession(row: MachineRow): DemoGraphicalSession {
  const profile = resolveGuestProfile(row);
  if (profile === 'windows-desktop') {
    return {
      profile,
      desktopEnvironment: 'windows',
      title: `${row.name} — Windows desktop`,
      subtitle: 'Graphical VNC session (simulated). Real clusters use KubeVirt VNC subresource.',
    };
  }
  const de = row.desktopEnvironment ?? 'xfce';
  return {
    profile: 'linux-desktop',
    desktopEnvironment: de,
    title: `${row.name} — ${de.toUpperCase()} desktop`,
    subtitle: 'Graphical VNC session (simulated). Boots into desktop environment, not a text shell.',
  };
}

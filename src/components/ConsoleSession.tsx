import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ConsoleChip, MachineRow } from '../lib/dashboards';
import { createDemoGraphicalSession, createDemoShellSession } from '../lib/demoConsole';
import { consoleWebSocketUrl, liveConsoleKind } from '../lib/liveConsole';
import { describeConsole } from '../lib/machineConsole';
import type { TelemetryDataSource } from '../lib/telemetry/dashboardAdapters';

interface ConsoleSessionProps {
  machine: MachineRow;
  chip: ConsoleChip;
  dataSource?: TelemetryDataSource;
  onClose: () => void;
}

function GraphicalConsoleMock({ machine }: { machine: MachineRow }) {
  const session = createDemoGraphicalSession(machine);
  const isWindows = session.desktopEnvironment === 'windows';
  const de = session.desktopEnvironment;

  return (
    <div className={`graphical-console-mock env-${de}`}>
      <header className="graphical-console-bar">
        <span>{session.title}</span>
        <small>{session.subtitle}</small>
      </header>
      <div className="graphical-console-desktop">
        {isWindows ? (
          <>
            <div className="mock-windows-taskbar">
              <span>Start</span>
              <span>{machine.name}</span>
              <span className="mock-clock">12:00</span>
            </div>
            <div className="mock-windows-desktop">
              <div className="mock-icon">This PC</div>
              <div className="mock-icon">Recycle Bin</div>
              <div className="mock-window">
                <header>Server Manager</header>
                <p>Windows Server — remote graphical session (VNC)</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`mock-linux-panel de-${de}`}>
              <span>{de.toUpperCase()} Session</span>
              <span>{machine.name}</span>
            </div>
            <div className="mock-linux-desktop">
              <div className="mock-terminal-icon">Terminal</div>
              <div className="mock-file-icon">Files</div>
              <div className="mock-window linux">
                <header>{de === 'kde' ? 'Konsole' : de === 'gnome' ? 'Terminal' : 'Terminal'}</header>
                <p>{machine.name}:~$ # desktop environment booted — use VNC for full GUI</p>
              </div>
            </div>
          </>
        )}
      </div>
      <footer className="graphical-console-footer">
        Simulated VNC frame · Live Harvester nodes use KubeVirt <code>/vnc</code> WebSocket
      </footer>
    </div>
  );
}

function LiveVncConsole({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting to KubeVirt VNC…');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disconnected = false;
    let rfb: { disconnect: () => void } | null = null;

    void import('@novnc/novnc').then((mod) => {
      if (disconnected || !hostRef.current) return;
      const RFB = mod.default;
      const session = new RFB(hostRef.current, url, { wsProtocols: [] });
      session.scaleViewport = true;
      session.resizeSession = true;
      session.addEventListener('connect', () => setStatus('KubeVirt VNC connected'));
      session.addEventListener('disconnect', () => setStatus('VNC disconnected'));
      session.addEventListener('securityfailure', () => setStatus('VNC authentication failed'));
      rfb = session;
    }).catch(() => {
      setStatus('noVNC is not available in this build');
    });

    return () => {
      disconnected = true;
      rfb?.disconnect();
    };
  }, [url]);

  return (
    <div className="live-vnc-console">
      <div className="live-vnc-status">{status}</div>
      <div className="live-vnc-host" ref={hostRef} />
    </div>
  );
}

function useLiveTerminal(url: string | null, banner: string, enabled: boolean) {
  const termRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !url || !termRef.current) return undefined;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0a0f14', foreground: '#c8e6ff', cursor: '#5eead4' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    term.writeln(banner);

    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      setStatus('connected');
      term.writeln('\r\n[live] attached to cluster console websocket');
    };
    socket.onerror = () => {
      setStatus('error');
      term.writeln('\r\n[live] websocket error — is the cockpit BFF serving /api/v1/console/* ?');
    };
    socket.onclose = () => {
      setStatus('closed');
      term.writeln('\r\n[live] console disconnected');
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data);
        return;
      }
      term.write(new Uint8Array(event.data as ArrayBuffer));
    };
    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      socket.close();
      term.dispose();
    };
  }, [banner, enabled, url]);

  return { termRef, status };
}

export function ConsoleSession({ machine, chip, dataSource, onClose }: ConsoleSessionProps) {
  const info = describeConsole(machine, chip.type);
  const isLive = dataSource === 'live';
  const liveKind = isLive ? liveConsoleKind(machine, chip) : null;
  const resolvedUrl = isLive && liveKind
    ? consoleWebSocketUrl(liveKind, machine.namespace || 'default', machine.name)
    : null;

  const demoTermRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(createDemoShellSession(machine));
  const lineBufferRef = useRef('');
  const liveTerminal = useLiveTerminal(
    resolvedUrl,
    `Nexus live console — ${machine.kind} · ${machine.name}`,
    Boolean(isLive && liveKind && liveKind !== 'vnc' && info.presentation !== 'graphical'),
  );

  useEffect(() => {
    if (isLive || info.presentation === 'graphical' || !demoTermRef.current) return undefined;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0a0f14', foreground: '#c8e6ff', cursor: '#5eead4' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(demoTermRef.current);
    fit.fit();
    const session = sessionRef.current;
    lineBufferRef.current = '';
    term.writeln(session.banner);
    term.write(session.prompt);
    term.onData((data) => {
      if (data === '\r') {
        term.write('\r\n');
        const lines = session.handleLine(lineBufferRef.current);
        lines.forEach((line) => term.writeln(line));
        lineBufferRef.current = '';
        term.write(session.prompt);
        return;
      }
      if (data === '\u007F') {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }
      lineBufferRef.current += data;
      term.write(data);
    });
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
  }, [info.presentation, isLive, machine.id]);

  const showLiveVnc = isLive && liveKind === 'vnc';
  const showLiveSerial = isLive && liveKind !== null && liveKind !== 'vnc' && info.presentation !== 'graphical';
  const showDemoGraphical = !isLive && info.presentation === 'graphical';
  const showLiveGraphicalFallback = isLive && info.presentation === 'graphical' && liveKind !== 'vnc';
  const showDemoShell = !isLive && info.presentation !== 'graphical';
  const showLiveUnavailable = isLive && liveKind === null;

  return (
    <div className="console-session-overlay" role="dialog" aria-label={`Console ${machine.name}`}>
      <div className="console-session-panel">
        <header className="console-session-header">
          <div>
            <span className="dash-kicker">CONSOLE // {info.presentation.toUpperCase()}</span>
            <h3>{machine.name}</h3>
            <p>
              {isLive && liveKind
                ? `Live ${liveKind} attach via cockpit /api/v1/console/${liveKind}`
                : info.hint}
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Disconnect
          </button>
        </header>
        {showLiveVnc && resolvedUrl && <LiveVncConsole url={resolvedUrl} />}
        {showLiveSerial && <div className="console-terminal-host" ref={liveTerminal.termRef} />}
        {showDemoGraphical && <GraphicalConsoleMock machine={machine} />}
        {showLiveGraphicalFallback && (
          <div className="console-live-unavailable">
            Graphical consoles attach through KubeVirt VNC. This {machine.kind} has no VMI subresource.
          </div>
        )}
        {showDemoShell && <div className="console-terminal-host" ref={demoTermRef} />}
        {showLiveUnavailable && (
          <div className="console-live-unavailable">
            No KubeVirt VNC/serial or kubectl exec target for {machine.kind} {machine.name}.
            Nodes do not expose a guest console through this API.
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ConsoleChip, MachineRow } from '../lib/dashboards';
import { createDemoGraphicalSession, createDemoShellSession } from '../lib/demoConsole';
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

export function ConsoleSession({ machine, chip, dataSource, onClose }: ConsoleSessionProps) {
  const info = describeConsole(machine, chip.type);
  const isLive = dataSource === 'live';
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const lineBufferRef = useRef('');
  const sessionRef = useRef(createDemoShellSession(machine));

  useEffect(() => {
    if (info.presentation === 'graphical' || !termRef.current) return undefined;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0a0f14',
        foreground: '#c8e6ff',
        cursor: '#5eead4',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    xtermRef.current = term;

    const session = sessionRef.current;
    lineBufferRef.current = '';
    term.writeln(session.banner);
    term.write(session.prompt);

    if (isLive) {
      term.writeln('\r\n[live] kubectl exec / virtctl console would attach here on Harvester node.');
      term.writeln('[live] Demo terminal shown until console BFF WebSocket is connected.');
    }

    term.onData((data) => {
      if (data === '\r') {
        term.write('\r\n');
        const lines = session.handleLine(lineBufferRef.current);
        lines.forEach((l) => term.writeln(l));
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
      xtermRef.current = null;
    };
  }, [info.presentation, isLive, machine.id]);

  return (
    <div className="console-session-overlay" role="dialog" aria-label={`Console ${machine.name}`}>
      <div className="console-session-panel">
        <header className="console-session-header">
          <div>
            <span className="dash-kicker">CONSOLE // {info.presentation.toUpperCase()}</span>
            <h3>{machine.name}</h3>
            <p>{info.hint}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Disconnect
          </button>
        </header>
        {info.presentation === 'graphical' ? (
          <GraphicalConsoleMock machine={machine} />
        ) : (
          <div className="console-terminal-host" ref={termRef} />
        )}
      </div>
    </div>
  );
}

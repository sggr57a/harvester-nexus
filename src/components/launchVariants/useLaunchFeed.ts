import { useEffect, useRef, useState } from 'react';
import {
  BOOT_DURATION_MS,
  LOG_TICK_MS,
  computeBootSystems,
  nextBootLogLine,
  type BootLogLine,
  type BootSystem,
} from '../../lib/launchBootFeed';

export interface LaunchFeed {
  /** Elapsed time in ms since the launch started. Loops in preview mode. */
  elapsedMs: number;
  /** Boot phase progress 0..1 (clamped). */
  progress: number;
  /** Live snapshot of the 16 boot systems with progress + phase. */
  systems: BootSystem[];
  /** Rolling buffer of log lines, newest at the END. Length is capped at
   *  `bufferSize`. Each variant chooses how to render this. */
  logLines: BootLogLine[];
  /** Aggregate ready-count for the header. */
  readyCount: number;
  /** Total system count for the header. */
  totalCount: number;
}

export interface UseLaunchFeedOptions {
  /** When `true`, the feed loops indefinitely (for the gallery + chooser).
   *  When `false` (default), it runs once for `BOOT_DURATION_MS` then holds. */
  loop?: boolean;
  /** Maximum number of log lines retained in the buffer. */
  bufferSize?: number;
}

export function useLaunchFeed({ loop = false, bufferSize = 80 }: UseLaunchFeedOptions = {}): LaunchFeed {
  const startRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [now, setNow] = useState<number>(0);
  const [logLines, setLogLines] = useState<BootLogLine[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let animFrame = 0;
    const step = () => {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startRef.current;
      const visualElapsed = loop ? t % (BOOT_DURATION_MS + 600) : Math.min(BOOT_DURATION_MS, t);
      setNow(visualElapsed);
      animFrame = window.requestAnimationFrame(step);
    };
    animFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animFrame);
  }, [loop]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const id = window.setInterval(() => {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startRef.current;
      setLogLines((prev) => {
        const next = [...prev, nextBootLogLine(t)];
        if (next.length > bufferSize) return next.slice(next.length - bufferSize);
        return next;
      });
    }, LOG_TICK_MS);
    return () => window.clearInterval(id);
  }, [bufferSize]);

  const systems = computeBootSystems(now);
  const readyCount = systems.filter((s) => s.phase === 'ready').length;
  const progress = Math.max(0, Math.min(1, now / BOOT_DURATION_MS));

  return {
    elapsedMs: now,
    progress,
    systems,
    logLines,
    readyCount,
    totalCount: systems.length,
  };
}

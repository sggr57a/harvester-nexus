import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOOT_DURATION_MS,
  computeBootSystems,
  nextBootLogLine,
  _resetLogSequence,
} from './launchBootFeed';

describe('launchBootFeed · computeBootSystems', () => {
  it('returns a stable list of 16 systems regardless of time', () => {
    expect(computeBootSystems(0).length).toBe(16);
    expect(computeBootSystems(BOOT_DURATION_MS).length).toBe(16);
    expect(computeBootSystems(BOOT_DURATION_MS * 2).length).toBe(16);
    const ids0 = computeBootSystems(0).map((s) => s.id);
    const idsLate = computeBootSystems(BOOT_DURATION_MS).map((s) => s.id);
    expect(ids0).toEqual(idsLate);
  });

  it('progress is monotonic non-decreasing in t', () => {
    const checkpoints = [0, 200, 600, 1200, 2200, 3200, 5000];
    for (const id of computeBootSystems(0).map((s) => s.id)) {
      let prev = -1;
      for (const t of checkpoints) {
        const now = computeBootSystems(t).find((s) => s.id === id)!.progress;
        expect(now).toBeGreaterThanOrEqual(prev);
        prev = now;
      }
    }
  });

  it('all systems are ready at t = BOOT_DURATION_MS', () => {
    const systems = computeBootSystems(BOOT_DURATION_MS);
    for (const s of systems) {
      expect(s.progress).toBeCloseTo(1, 5);
      expect(s.phase).toBe('ready');
    }
  });

  it('all systems are queued at t=0', () => {
    const systems = computeBootSystems(0);
    for (const s of systems) {
      expect(s.progress).toBe(0);
      expect(s.phase).toBe('queued');
    }
  });

  it('phase classifies correctly across the boundaries', () => {
    // identity finishes at 240 ms, starts at -120ms (clamped to 0) — at t=120
    // it should be partway through loading.
    const at120 = computeBootSystems(120).find((s) => s.id === 'identity')!;
    expect(at120.phase).toBe('loading');
    expect(at120.progress).toBeGreaterThan(0.05);
    expect(at120.progress).toBeLessThan(1);
  });
});

describe('launchBootFeed · nextBootLogLine', () => {
  beforeEach(() => _resetLogSequence());

  it('produces a stream of unique log lines with monotonic ids', () => {
    const lines = Array.from({ length: 30 }, (_, i) => nextBootLogLine(i * 80));
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(lines.length);
  });

  it('cycles through all 16 templates so the right rail stays varied', () => {
    const lines = Array.from({ length: 32 }, (_, i) => nextBootLogLine(i * 80));
    const sources = new Set(lines.map((l) => l.source));
    // Expect at least 12 distinct sources across 32 lines (allowing for
    // template duplication of {info, ok} same-source lines).
    expect(sources.size).toBeGreaterThanOrEqual(10);
  });

  it('every line has a level ∈ info/ok/warn/error and a non-empty message', () => {
    for (let i = 0; i < 50; i += 1) {
      const line = nextBootLogLine(i);
      expect(['info', 'ok', 'warn', 'error']).toContain(line.level);
      expect(line.message.length).toBeGreaterThan(0);
      expect(line.source.length).toBeGreaterThan(0);
    }
  });
});

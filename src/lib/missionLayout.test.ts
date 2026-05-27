import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_VERSION,
  MISSION_WIDGETS,
  clearLayout,
  defaultLayout,
  isCustomized,
  readLayout,
  writeLayout,
} from './missionLayout';

class StubStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

beforeEach(() => {
  const stub = new StubStorage();
  vi.stubGlobal('window', { localStorage: stub });
  vi.stubGlobal('localStorage', stub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('missionLayout · defaults', () => {
  it('every widget has a default and unique id', () => {
    const ids = MISSION_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MISSION_WIDGETS.length).toBeGreaterThan(15);
  });

  it('default layout contains every widget', () => {
    const layout = defaultLayout();
    expect(layout.length).toBe(MISSION_WIDGETS.length);
    const ids = layout.map((l) => l.i);
    for (const w of MISSION_WIDGETS) expect(ids).toContain(w.id);
  });

  it('all defaults fit within the 12-column grid', () => {
    for (const w of MISSION_WIDGETS) {
      expect(w.default.x).toBeGreaterThanOrEqual(0);
      expect(w.default.x + w.default.w).toBeLessThanOrEqual(12);
      expect(w.default.h).toBeGreaterThan(0);
    }
  });

  it('every widget has a minW and minH that is no greater than its default', () => {
    for (const w of MISSION_WIDGETS) {
      if (w.minW !== undefined) expect(w.minW).toBeLessThanOrEqual(w.default.w);
      if (w.minH !== undefined) expect(w.minH).toBeLessThanOrEqual(w.default.h);
    }
  });
});

describe('missionLayout · persistence', () => {
  it('readLayout returns defaults when nothing is stored', () => {
    expect(readLayout()).toEqual(defaultLayout());
  });

  it('write → read round-trip preserves the layout', () => {
    const custom = defaultLayout().map((l) => ({ ...l, x: 0, y: l.y, w: 12, h: l.h }));
    writeLayout(custom);
    const round = readLayout();
    expect(round.length).toBe(custom.length);
    for (let i = 0; i < custom.length; i += 1) {
      expect(round.find((r) => r.i === custom[i].i)).toMatchObject({ w: 12, x: 0 });
    }
  });

  it('clearLayout removes the stored layout so defaults come back', () => {
    writeLayout(defaultLayout().map((l) => ({ ...l, w: 1 })));
    clearLayout();
    expect(readLayout()).toEqual(defaultLayout());
  });

  it('readLayout discards stored entries with unknown ids', () => {
    const corrupt = [
      { i: 'phantom-widget', x: 0, y: 0, w: 6, h: 4 },
      ...defaultLayout(),
    ];
    writeLayout(corrupt as never);
    const result = readLayout();
    for (const l of result) {
      expect(MISSION_WIDGETS.some((w) => w.id === l.i)).toBe(true);
    }
  });

  it('readLayout adds defaults for widgets missing from the stored layout', () => {
    const partial = defaultLayout().slice(0, 4);
    writeLayout(partial);
    const result = readLayout();
    expect(result.length).toBe(MISSION_WIDGETS.length);
  });

  it('readLayout falls back to defaults on parse error', () => {
    window.localStorage.setItem(`nexus.missionControl.layout.v${LAYOUT_VERSION}`, '{not json}');
    expect(readLayout()).toEqual(defaultLayout());
  });
});

describe('missionLayout · isCustomized', () => {
  it('default layout is not customized', () => {
    expect(isCustomized(defaultLayout())).toBe(false);
  });

  it('any change in x / y / w / h flags as customized', () => {
    const layout = defaultLayout();
    const moved = [...layout];
    moved[0] = { ...moved[0], x: moved[0].x + 1 };
    expect(isCustomized(moved)).toBe(true);
    const sized = [...layout];
    sized[0] = { ...sized[0], h: sized[0].h + 1 };
    expect(isCustomized(sized)).toBe(true);
  });

  it('extra unknown widgets count as customized', () => {
    const layout = [...defaultLayout(), { i: 'phantom', x: 0, y: 0, w: 4, h: 4 }];
    expect(isCustomized(layout as never)).toBe(true);
  });
});

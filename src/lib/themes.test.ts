import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, getTheme, isThemeId, THEME_CATALOG } from './themes';

describe('theme catalog', () => {
  it('offers multiple visual styles for the cockpit mockup', () => {
    expect(THEME_CATALOG).toHaveLength(8);
    expect(THEME_CATALOG.map((theme) => theme.id)).toEqual([
      'route-grid',
      'emerald-console',
      'solar-flare',
      'arctic-hologram',
      'violet-nebula',
      'noir-radar',
      'void-protocol',
      'arctic-command',
    ]);
    expect(THEME_CATALOG.every((theme) => theme.swatches.length >= 5)).toBe(true);
    expect(THEME_CATALOG.every((theme) => theme.visualStyle.length > 20)).toBe(true);
  });

  it('validates and resolves only catalog-backed theme ids', () => {
    expect(isThemeId(DEFAULT_THEME_ID)).toBe(true);
    expect(isThemeId('violet-nebula')).toBe(true);
    expect(isThemeId('void-protocol')).toBe(true);
    expect(isThemeId('unknown-theme')).toBe(false);
    expect(getTheme('noir-radar').name).toBe('Noir Radar');
  });
});

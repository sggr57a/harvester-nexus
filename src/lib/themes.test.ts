import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, getTheme, isThemeId, THEME_CATALOG } from './themes';

describe('theme catalog', () => {
  it('offers a curated set of cool-tone HUD themes', () => {
    expect(THEME_CATALOG).toHaveLength(5);
    expect(THEME_CATALOG.map((theme) => theme.id)).toEqual([
      'route-grid',
      'arctic-hologram',
      'arctic-command',
      'ice-spectrum',
      'plasma-vortex',
    ]);
    expect(THEME_CATALOG.every((theme) => theme.swatches.length >= 5)).toBe(true);
    expect(THEME_CATALOG.every((theme) => theme.visualStyle.length > 20)).toBe(true);
  });

  it('validates and resolves only catalog-backed theme ids', () => {
    expect(isThemeId(DEFAULT_THEME_ID)).toBe(true);
    expect(isThemeId('ice-spectrum')).toBe(true);
    expect(isThemeId('plasma-vortex')).toBe(true);
    expect(isThemeId('emerald-console')).toBe(false);
    expect(isThemeId('nightwatch-crimson')).toBe(false);
    expect(isThemeId('tactical-nvg')).toBe(false);
    expect(isThemeId('unknown-theme')).toBe(false);
    expect(getTheme('arctic-hologram').name).toBe('Arctic Hologram');
  });
});

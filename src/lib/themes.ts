export type ThemeId = 'route-grid' | 'emerald-console' | 'solar-flare';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  swatches: string[];
}

export const THEME_CATALOG: ThemeDefinition[] = [
  {
    id: 'route-grid',
    name: 'Route Grid',
    tagline: 'Futuristic vector routes over dark navy circuitry',
    swatches: ['#04101f', '#0e2742', '#33f7ff', '#5b8bff', '#a4f9ff'],
  },
  {
    id: 'emerald-console',
    name: 'Emerald Console',
    tagline: 'Deep black-glass cockpit with emerald data',
    swatches: ['#020608', '#082015', '#1f7a52', '#36d399', '#a8ffd0'],
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    tagline: 'Charcoal blueprint with amber contours',
    swatches: ['#0d0a06', '#2a1c08', '#ff8c2a', '#ffd166', '#ffeeb0'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'route-grid';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === 'route-grid' || value === 'emerald-console' || value === 'solar-flare';
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_CATALOG.find((theme) => theme.id === id) ?? THEME_CATALOG[0];
}

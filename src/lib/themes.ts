export type ThemeId = 'route-grid' | 'emerald-console' | 'solar-flare' | 'void-protocol' | 'arctic-command';

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
  {
    id: 'void-protocol',
    name: 'Void Protocol',
    tagline: 'Neon violet cyberpunk on absolute black',
    swatches: ['#060010', '#130028', '#7c3aed', '#c084fc', '#e9d5ff'],
  },
  {
    id: 'arctic-command',
    name: 'Arctic Command',
    tagline: 'Ice-blue military command center on dark slate',
    swatches: ['#040d12', '#081c28', '#0ea5e9', '#7dd3fc', '#e0f2fe'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'route-grid';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return (
    value === 'route-grid' ||
    value === 'emerald-console' ||
    value === 'solar-flare' ||
    value === 'void-protocol' ||
    value === 'arctic-command'
  );
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_CATALOG.find((theme) => theme.id === id) ?? THEME_CATALOG[0];
}

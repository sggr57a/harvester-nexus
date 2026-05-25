export type ThemeId =
  | 'route-grid'
  | 'emerald-console'
  | 'nightwatch-crimson'
  | 'tactical-nvg'
  | 'ice-spectrum'
  | 'plasma-vortex'
  | 'arctic-command';

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
    id: 'nightwatch-crimson',
    name: 'Nightwatch Crimson',
    tagline: 'Carbon black bunker with crimson tactical overlays',
    swatches: ['#08040a', '#1c0709', '#ff2e63', '#ff7a59', '#ffd6c2'],
  },
  {
    id: 'tactical-nvg',
    name: 'Tactical NVG',
    tagline: 'Night-vision CRT phosphor on graphite chassis',
    swatches: ['#020a06', '#072014', '#3aff8e', '#9dff66', '#caffaa'],
  },
  {
    id: 'ice-spectrum',
    name: 'Ice Spectrum',
    tagline: 'Glacial cobalt panes with prismatic spectrum',
    swatches: ['#040a14', '#0a1f3a', '#8be9ff', '#ffffff', '#b6c8ff'],
  },
  {
    id: 'plasma-vortex',
    name: 'Plasma Vortex',
    tagline: 'Magenta-electric plasma over deep void',
    swatches: ['#06030d', '#1a0533', '#ff4af7', '#ffd166', '#5bf2ff'],
  },
  {
    id: 'arctic-command',
    name: 'Arctic Command',
    tagline: 'Ice-blue military command center on dark slate',
    swatches: ['#040d12', '#081c28', '#0ea5e9', '#7dd3fc', '#e0f2fe'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'route-grid';

const THEME_IDS: ThemeId[] = THEME_CATALOG.map((theme) => theme.id);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_CATALOG.find((theme) => theme.id === id) ?? THEME_CATALOG[0];
}

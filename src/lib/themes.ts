export type ThemeId =
  | 'route-grid'
  | 'arctic-hologram'
  | 'arctic-command'
  | 'ice-spectrum';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Short descriptor of the dominant visual treatment used by the tooltip in the theme picker. */
  visualStyle: string;
  swatches: string[];
}

export const THEME_CATALOG: ThemeDefinition[] = [
  {
    id: 'route-grid',
    name: 'Route Grid',
    tagline: 'Futuristic vector routes over deep navy circuitry',
    visualStyle: 'blueprint grid, cyan traces, squared tactical panels',
    swatches: ['#020611', '#06121f', '#33f7ff', '#5b8bff', '#a4f9ff'],
  },
  {
    id: 'arctic-hologram',
    name: 'Arctic Hologram',
    tagline: 'Icy glass telemetry with electric blue depth',
    visualStyle: 'translucent ice layers, azure glow, soft holographic rings',
    swatches: ['#03111f', '#0b3150', '#7dd3fc', '#38bdf8', '#e0f7ff'],
  },
  {
    id: 'arctic-command',
    name: 'Arctic Command',
    tagline: 'Ice-blue military command center on near-black slate',
    visualStyle: 'dark slate command glass, ice-blue instruments, frosted geometry',
    swatches: ['#01080d', '#04111c', '#0ea5e9', '#7dd3fc', '#e0f2fe'],
  },
  {
    id: 'ice-spectrum',
    name: 'Ice Spectrum',
    tagline: 'Glacial cobalt panes with prismatic spectrum',
    visualStyle: 'glacial cobalt panes, prismatic spectrum bloom, white-hot accents',
    swatches: ['#02060e', '#06121f', '#8be9ff', '#ffffff', '#b6c8ff'],
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

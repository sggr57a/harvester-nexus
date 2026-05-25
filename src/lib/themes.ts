export type ThemeId =
  | 'route-grid'
  | 'arctic-hologram'
  | 'arctic-command'
  | 'ice-spectrum'
  | 'plasma-vortex';
  | 'solar-flare'
  | 'arctic-hologram'
  | 'arctic-command';

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
    swatches: ['#04101f', '#0e2742', '#33f7ff', '#5b8bff', '#a4f9ff'],
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    tagline: 'Charcoal blueprint with amber contours',
    visualStyle: 'warm amber instrumentation, graphite plates, hazard rails',
    swatches: ['#0d0a06', '#2a1c08', '#ff8c2a', '#ffd166', '#ffeeb0'],
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
  {
    id: 'plasma-vortex',
    name: 'Plasma Vortex',
    tagline: 'Magenta-electric plasma over deep void',
    visualStyle: 'magenta plasma rings, electric cyan accents, deep void backplate',
    swatches: ['#020108', '#0b0218', '#ff4af7', '#ffd166', '#5bf2ff'],
    tagline: 'Ice-blue military command center on dark slate',
    visualStyle: 'dark slate command glass, ice-blue instruments, frosted geometry',
    swatches: ['#040d12', '#081c28', '#0ea5e9', '#7dd3fc', '#e0f2fe'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'route-grid';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
  if (typeof value !== 'string') return false;
  return THEME_CATALOG.some((theme) => theme.id === value);
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_CATALOG.find((theme) => theme.id === id) ?? THEME_CATALOG[0];
}

export type ThemeId =
  | 'route-grid'
  | 'emerald-console'
  | 'solar-flare'
  | 'arctic-hologram'
  | 'violet-nebula'
  | 'noir-radar'
  | 'holo-quantum'
  | 'nightwatch-crimson'
  | 'tactical-nvg'
  | 'ice-spectrum'
  | 'plasma-vortex'
  | 'void-protocol'
  | 'arctic-command';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  visualStyle: string;
  swatches: string[];
}

export const THEME_CATALOG: ThemeDefinition[] = [
  {
    id: 'route-grid',
    name: 'Route Grid',
    tagline: 'Futuristic vector routes over dark navy circuitry',
    visualStyle: 'blueprint grid, cyan traces, squared tactical panels',
    swatches: ['#04101f', '#0e2742', '#33f7ff', '#5b8bff', '#a4f9ff'],
  },
  {
    id: 'emerald-console',
    name: 'Emerald Console',
    tagline: 'Deep black-glass cockpit with emerald data',
    visualStyle: 'phosphor terminal, rounded glass, green signal bloom',
    swatches: ['#020608', '#082015', '#1f7a52', '#36d399', '#a8ffd0'],
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
    id: 'violet-nebula',
    name: 'Violet Nebula',
    tagline: 'Purple orbital lab with magenta command energy',
    visualStyle: 'orbital arcs, violet fog, magenta and cyan control pulses',
    swatches: ['#09051a', '#21104a', '#8b5cf6', '#f472b6', '#67e8f9'],
  },
  {
    id: 'noir-radar',
    name: 'Noir Radar',
    tagline: 'Monochrome tactical radar with lime targeting',
    visualStyle: 'black ops scopes, white etched lines, lime radar sweeps',
    swatches: ['#030303', '#151515', '#f8fafc', '#9ca3af', '#a3ff12'],
  },
  {
    id: 'holo-quantum',
    name: 'Holo Quantum',
    tagline: 'Violet holographic mesh with cyan accents',
    visualStyle: 'violet holographic mesh, quantum lattice, cyan edge glow',
    swatches: ['#0a0418', '#1d0a3a', '#7c3bff', '#b86bff', '#36ecff'],
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
    id: 'void-protocol',
    name: 'Void Protocol',
    tagline: 'Neon violet cyberpunk on absolute black',
    visualStyle: 'absolute-black glass, ultraviolet rails, high-contrast neon glyphs',
    swatches: ['#060010', '#130028', '#7c3aed', '#c084fc', '#e9d5ff'],
  },
  {
    id: 'arctic-command',
    name: 'Arctic Command',
    tagline: 'Ice-blue military command center on dark slate',
    visualStyle: 'dark slate command glass, ice-blue instruments, frosted geometry',
    swatches: ['#040d12', '#081c28', '#0ea5e9', '#7dd3fc', '#e0f2fe'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'route-grid';

const THEME_IDS: ThemeId[] = THEME_CATALOG.map((theme) => theme.id);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_CATALOG.some((theme) => theme.id === value);
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_CATALOG.find((theme) => theme.id === id) ?? THEME_CATALOG[0];
}

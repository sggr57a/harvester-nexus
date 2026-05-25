export type ThemeId =
  | 'route-grid'
  | 'emerald-console'
  | 'arctic-hologram'
  | 'noir-radar'
  | 'tactical-nvg'
  | 'ice-spectrum'
  | 'cyber-wireframe'
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
    id: 'arctic-hologram',
    name: 'Arctic Hologram',
    tagline: 'Icy glass telemetry with electric blue depth',
    visualStyle: 'translucent ice layers, azure glow, soft holographic rings',
    swatches: ['#03111f', '#0b3150', '#7dd3fc', '#38bdf8', '#e0f7ff'],
  },
  {
    id: 'noir-radar',
    name: 'Noir Radar',
    tagline: 'Monochrome tactical radar with lime targeting',
    visualStyle: 'black ops scopes, white etched lines, lime radar sweeps',
    swatches: ['#030303', '#151515', '#f8fafc', '#9ca3af', '#a3ff12'],
  },
  {
    id: 'tactical-nvg',
    name: 'Tactical NVG',
    tagline: 'Night-vision CRT phosphor on graphite chassis',
    visualStyle: 'night-vision green phosphor, CRT scan, military spec',
    swatches: ['#020a06', '#072014', '#3aff8e', '#9dff66', '#caffaa'],
  },
  {
    id: 'ice-spectrum',
    name: 'Ice Spectrum',
    tagline: 'Glacial cobalt panes with prismatic spectrum',
    visualStyle: 'glacial cobalt layers, prismatic white highlights',
    swatches: ['#040a14', '#0a1f3a', '#8be9ff', '#ffffff', '#b6c8ff'],
  },
  {
    id: 'cyber-wireframe',
    name: 'Cyber Wireframe',
    tagline: 'Pure-black void with holographic wireframe outlines',
    visualStyle: 'absolute-black background, transparent panels, neon wireframe borders, draw/redraw animations',
    swatches: ['#000000', '#050505', '#00ffc8', '#00b8ff', '#00ff88'],
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

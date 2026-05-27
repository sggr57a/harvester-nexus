/**
 * Launch variant registry. Adding a new variant is a one-line change here:
 * import the component, add it to the LAUNCH_VARIANTS array.
 */

import { Variant1ConcentricBoot } from './Variant1ConcentricBoot';
import { Variant2StatusCascade } from './Variant2StatusCascade';
import { Variant3HexGrid } from './Variant3HexGrid';
import { Variant4RadarSweep } from './Variant4RadarSweep';
import type { LaunchFeed } from './useLaunchFeed';

export type LaunchVariantId = 'concentric-boot' | 'status-cascade' | 'hex-grid' | 'radar-sweep';

export interface LaunchVariantSpec {
  id: LaunchVariantId;
  /** Display name for the gallery + chooser. */
  label: string;
  /** One-line description shown in the gallery card. */
  blurb: string;
  /** React component that renders the variant. */
  Component: (props: { feed: LaunchFeed }) => JSX.Element;
}

export const LAUNCH_VARIANTS: LaunchVariantSpec[] = [
  {
    id: 'concentric-boot',
    label: 'Concentric Boot',
    blurb: 'Five-ring rotating composition with thin left rail and right boot-feed log.',
    Component: Variant1ConcentricBoot,
  },
  {
    id: 'status-cascade',
    label: 'Status Cascade',
    blurb: 'Pure left/right split — segmented progress rows + dense scrolling kernel log.',
    Component: Variant2StatusCascade,
  },
  {
    id: 'hex-grid',
    label: 'Hex Grid',
    blurb: 'Hexagonal centerpiece with illuminating satellites; subsystem tree + flicker log.',
    Component: Variant3HexGrid,
  },
  {
    id: 'radar-sweep',
    label: 'Radar Sweep',
    blurb: 'Polar radar with outposts brightening as systems boot; packet-stream log.',
    Component: Variant4RadarSweep,
  },
];

export const DEFAULT_LAUNCH_VARIANT: LaunchVariantId = 'concentric-boot';
const STORAGE_KEY = 'nexus.launchVariant';

export function readLaunchVariant(): LaunchVariantId {
  if (typeof window === 'undefined') return DEFAULT_LAUNCH_VARIANT;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (LAUNCH_VARIANTS.some((v) => v.id === stored)) return stored as LaunchVariantId;
  return DEFAULT_LAUNCH_VARIANT;
}

export function writeLaunchVariant(id: LaunchVariantId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

export { useLaunchFeed } from './useLaunchFeed';
export type { LaunchFeed };

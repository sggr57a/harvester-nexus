import { useMemo } from 'react';
import {
  LAUNCH_VARIANTS,
  readLaunchVariant,
  useLaunchFeed,
} from './launchVariants';

/**
 * Runtime launch screen — picks the variant the operator chose in the
 * Launch Mockups gallery (defaulting to "Concentric Boot" if none has
 * been saved). The variant runs once for ~3.2 s with the feed in
 * one-shot mode, after which the parent App swaps in the cockpit.
 */
export function LaunchSequence() {
  const variantId = useMemo(() => readLaunchVariant(), []);
  const variant = LAUNCH_VARIANTS.find((v) => v.id === variantId) ?? LAUNCH_VARIANTS[0];
  const feed = useLaunchFeed({ loop: false });
  return (
    <main className="launch-runtime">
      <variant.Component feed={feed} />
    </main>
  );
}

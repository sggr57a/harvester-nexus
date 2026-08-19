import type { ReactNode } from 'react';

/** Theme-native HUD chrome: ghost orbs, scanlines, grid wash. */
export function HologramHudShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`holo-shell ${className}`.trim()}>
      <div className="holo-shell-grid" aria-hidden="true" />
      <div className="hud-orb hud-orb-left holo-orb-accent" aria-hidden="true" />
      <div className="hud-orb hud-orb-right holo-orb-accent-2" aria-hidden="true" />
      <div className="hud-scanlines holo-scanlines" aria-hidden="true" />
      {children}
    </div>
  );
}

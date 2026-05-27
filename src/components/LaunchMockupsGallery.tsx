/**
 * Launch mockups gallery — shows all four launch-screen variants playing
 * live side-by-side in a 2×2 grid so the operator can pick one. The
 * selection persists in localStorage and is read by the actual
 * `LaunchSequence` on the next login.
 *
 * Each card hosts its own copy of the launch feed (loop = true so the
 * animation never holds at 100 %) and renders the variant at a contained
 * scale so all four fit on a single 1080p viewport.
 */

import { useEffect, useState } from 'react';
import {
  LAUNCH_VARIANTS,
  readLaunchVariant,
  useLaunchFeed,
  writeLaunchVariant,
  type LaunchVariantId,
  type LaunchVariantSpec,
} from './launchVariants';

export function LaunchMockupsGallery() {
  const [selected, setSelected] = useState<LaunchVariantId>(() => readLaunchVariant());
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [focused, setFocused] = useState<LaunchVariantId | null>(null);

  useEffect(() => {
    if (!savedToast) return;
    const id = window.setTimeout(() => setSavedToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [savedToast]);

  const choose = (id: LaunchVariantId) => {
    setSelected(id);
    writeLaunchVariant(id);
    setSavedToast(LAUNCH_VARIANTS.find((v) => v.id === id)?.label ?? id);
  };

  return (
    <section className="lmg" aria-label="Launch mockups gallery">
      <header className="lmg-header">
        <div>
          <span className="dash-kicker">CHOOSE A LAUNCH STYLE</span>
          <h2>Launch screen mockups</h2>
          <p>
            Four self-contained variants — every one drives off the same live boot feed
            (16 platform subsystems + an 80 ms-tick log of fake-but-plausible kernel /
            k8s / xdr events). Click a card to set it as the launch animation that
            plays after every login. The selection persists in <code>localStorage</code>.
          </p>
        </div>
        <div className="lmg-current">
          <span>active</span>
          <strong>{LAUNCH_VARIANTS.find((v) => v.id === selected)?.label}</strong>
        </div>
      </header>

      <ul className="lmg-grid">
        {LAUNCH_VARIANTS.map((variant) => (
          <GalleryCard
            key={variant.id}
            variant={variant}
            isSelected={variant.id === selected}
            onSelect={() => choose(variant.id)}
            onFocus={() => setFocused(variant.id)}
            onUnfocus={() => setFocused(null)}
          />
        ))}
      </ul>

      {focused && (
        <FocusedPreview
          variantId={focused}
          onClose={() => setFocused(null)}
          onSelect={(id) => {
            choose(id);
            setFocused(null);
          }}
        />
      )}

      {savedToast && (
        <div className="lmg-toast" role="status">
          ✓ saved · <strong>{savedToast}</strong> will play on every login
        </div>
      )}
    </section>
  );
}

function GalleryCard({
  variant,
  isSelected,
  onSelect,
  onFocus,
}: {
  variant: LaunchVariantSpec;
  isSelected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onUnfocus: () => void;
}) {
  // Every card runs its own feed in loop mode so the animations don't all
  // freeze together at 100 %.
  const feed = useLaunchFeed({ loop: true });
  return (
    <li className={`lmg-card ${isSelected ? 'is-selected' : ''}`}>
      <header className="lmg-card-head">
        <strong>{variant.label}</strong>
        <small>{variant.blurb}</small>
      </header>
      <div className="lmg-card-stage">
        {/* Scaled mini-preview — uses CSS transform: scale to keep the
            variant's full layout legible inside a card. */}
        <div className="lmg-card-scale">
          <variant.Component feed={feed} />
        </div>
      </div>
      <footer className="lmg-card-actions">
        <button type="button" className="lmg-btn" onClick={onFocus}>preview full</button>
        <button
          type="button"
          className={`lmg-btn lmg-btn-primary ${isSelected ? 'is-active' : ''}`}
          onClick={onSelect}
        >
          {isSelected ? '✓ active' : 'use this style'}
        </button>
      </footer>
    </li>
  );
}

function FocusedPreview({
  variantId,
  onClose,
  onSelect,
}: {
  variantId: LaunchVariantId;
  onClose: () => void;
  onSelect: (id: LaunchVariantId) => void;
}) {
  const variant = LAUNCH_VARIANTS.find((v) => v.id === variantId)!;
  const feed = useLaunchFeed({ loop: true });
  return (
    <div className="lmg-focused" onClick={onClose} role="dialog" aria-label={`Preview · ${variant.label}`}>
      <div className="lmg-focused-stage" onClick={(e) => e.stopPropagation()}>
        <variant.Component feed={feed} />
        <div className="lmg-focused-actions">
          <button type="button" className="lmg-btn" onClick={onClose}>close</button>
          <button type="button" className="lmg-btn lmg-btn-primary" onClick={() => onSelect(variant.id)}>
            use this style
          </button>
        </div>
      </div>
    </div>
  );
}

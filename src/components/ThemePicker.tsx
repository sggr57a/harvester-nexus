import { useEffect, useRef, useState } from 'react';
import { THEME_CATALOG, getTheme, type ThemeId } from '../lib/themes';

interface ThemePickerProps {
  active: ThemeId;
  onSelect: (theme: ThemeId) => void;
}

/** Compact dropdown theme selector — replaces the tiled theme picker.
 * Shows the active theme as a button (label + swatches) and reveals the
 * full catalog inside a popover on click. Closes on outside click or Esc. */
export function ThemePicker({ active, onSelect }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeTheme = getTheme(active);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-dropdown" ref={wrapperRef}>
      <span className="theme-dropdown-label">THEME</span>
      <button
        type="button"
        className={`theme-dropdown-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={`${activeTheme.tagline}: ${activeTheme.visualStyle}`}
      >
        <span className="theme-dropdown-swatches" aria-hidden="true">
          {activeTheme.swatches.slice(0, 5).map((color, idx) => (
            <i key={`${activeTheme.id}-${idx}`} style={{ background: color }} />
          ))}
        </span>
        <span className="theme-dropdown-name">{activeTheme.name}</span>
        <span className="theme-dropdown-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="theme-dropdown-menu" role="listbox" aria-label="Theme">
          {THEME_CATALOG.map((theme) => (
            <li key={theme.id} role="option" aria-selected={active === theme.id}>
              <button
                type="button"
                className={`theme-dropdown-option ${active === theme.id ? 'is-selected' : ''}`}
                onClick={() => {
                  onSelect(theme.id);
                  setOpen(false);
                }}
                title={theme.visualStyle}
              >
                <span className="theme-dropdown-swatches" aria-hidden="true">
                  {theme.swatches.slice(0, 5).map((color, idx) => (
                    <i key={`${theme.id}-${idx}`} style={{ background: color }} />
                  ))}
                </span>
                <span>
                  <strong>{theme.name}</strong>
                  <small>{theme.tagline}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  const activeTheme = getTheme(active);
  return (
    <label className="theme-picker theme-picker-dropdown" aria-label="Dashboard theme">
      <span className="theme-picker-title">Theme</span>
      <span className="theme-picker-shell">
        <span className="theme-picker-swatches" aria-hidden="true">
          {activeTheme.swatches.map((color, idx) => (
            <i key={`${activeTheme.id}-sw-${idx}`} style={{ background: color }} />
          ))}
        </span>
        <select
          className="theme-picker-select"
          value={active}
          onChange={(event) => {
            const next = event.target.value as ThemeId;
            onSelect(next);
          }}
        >
          {THEME_CATALOG.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
        <span className="theme-picker-caret" aria-hidden="true">▾</span>
      </span>
      <small className="theme-picker-tagline">{activeTheme.tagline}</small>
    </label>
  );
}

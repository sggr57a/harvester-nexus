import { THEME_CATALOG, getTheme, type ThemeId } from '../lib/themes';

interface ThemePickerProps {
  active: ThemeId;
  onSelect: (theme: ThemeId) => void;
}

export function ThemePicker({ active, onSelect }: ThemePickerProps) {
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

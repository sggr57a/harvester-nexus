import { THEME_CATALOG, type ThemeId } from '../lib/themes';

interface ThemePickerProps {
  active: ThemeId;
  onSelect: (theme: ThemeId) => void;
}

export function ThemePicker({ active, onSelect }: ThemePickerProps) {
  const activeTheme = THEME_CATALOG.find((t) => t.id === active);
  return (
    <div className="theme-picker-dropdown" aria-label="Dashboard theme">
      <label className="theme-dropdown-label">
        <span className="theme-dropdown-title">THEME</span>
        <div className="theme-dropdown-wrapper">
          <select
            className="theme-dropdown-select"
            value={active}
            onChange={(e) => onSelect(e.target.value as ThemeId)}
          >
            {THEME_CATALOG.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
          <span className="theme-dropdown-swatches" aria-hidden="true">
            {activeTheme?.swatches.slice(0, 4).map((color, index) => (
              <i key={index} style={{ background: color }} />
            ))}
          </span>
        </div>
      </label>
    </div>
  );
}

import { THEME_CATALOG, type ThemeId } from '../lib/themes';

interface ThemePickerProps {
  active: ThemeId;
  onSelect: (theme: ThemeId) => void;
}

export function ThemePicker({ active, onSelect }: ThemePickerProps) {
  return (
    <div className="theme-picker" aria-label="Dashboard theme">
      <span className="theme-picker-title">Theme</span>
      <div className="theme-picker-options">
        {THEME_CATALOG.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-option ${active === theme.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(theme.id)}
            aria-pressed={active === theme.id}
            title={`${theme.tagline}: ${theme.visualStyle}`}
          >
            <span className="theme-swatches" aria-hidden="true">
              {theme.swatches.map((color, index) => (
                <i key={`${theme.id}-${index}`} style={{ background: color }} />
              ))}
            </span>
            <span className="theme-name">{theme.name}</span>
            <small>{theme.tagline}</small>
            <em>{theme.visualStyle}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

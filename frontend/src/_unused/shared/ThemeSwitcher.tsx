import type { ThemeSetting } from '../hooks/useTheme';

interface ThemeSwitcherProps {
  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  onChange: (theme: ThemeSetting) => void;
}

const OPTIONS: Array<{ value: ThemeSetting; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeSwitcher({ theme, resolvedTheme, onChange }: ThemeSwitcherProps) {
  return (
    <div className="theme-switcher glass" data-resolved={resolvedTheme}>
      {OPTIONS.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? 'theme-switcher-btn active' : 'theme-switcher-btn'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}


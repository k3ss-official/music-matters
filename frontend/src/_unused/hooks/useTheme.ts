import { useEffect, useMemo, useState } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'auto';

interface ThemeState {
  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  setTheme: (next: ThemeSetting) => void;
}

const STORAGE_KEY = 'mm-theme-setting';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): ThemeState {
  const [theme, setThemeState] = useState<ThemeSetting>(() => {
    if (typeof window === 'undefined') {
      return 'auto';
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeSetting | null;
    return stored ?? 'auto';
  });

  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (event: MediaQueryListEvent) => {
        setSystemTheme(event.matches ? 'dark' : 'light');
      };
      query.addEventListener('change', handler);
      return () => query.removeEventListener('change', handler);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const resolvedTheme = useMemo<'light' | 'dark'>(() => {
    if (theme === 'auto') {
      return systemTheme;
    }
    return theme;
  }, [theme, systemTheme]);

  const setTheme = (next: ThemeSetting) => {
    setThemeState(next);
  };

  return { theme, resolvedTheme, setTheme };
}


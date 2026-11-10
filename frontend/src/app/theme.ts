import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'p2p-theme';

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** The site is light unless the visitor picks the dark theme. */
const DEFAULT_THEME: Theme = 'light';

/** A manual light/dark choice, remembered between visits. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [choice, setChoice] = useState<Theme | null>(stored);

  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
  }, [choice]);

  const theme = choice ?? DEFAULT_THEME;
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setChoice(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable; the choice still applies for this visit */
    }
  }, [theme]);

  return { theme, toggle };
}

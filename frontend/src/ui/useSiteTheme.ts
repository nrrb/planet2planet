import { useSyncExternalStore } from 'react';
import type { MapTheme } from '../map/palette';

const subscribe = (notify: () => void): (() => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/** The theme the site is showing right now. Light unless the visitor chose dark. */
export function useSiteTheme(): MapTheme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    () => 'light',
  );
}

/** Display configuration. Business rules stay in the API. */
export const DEFAULT_FROM = 'jupiter';
export const DEFAULT_TO = 'saturn';
export const REPO_URL: string = (import.meta.env.VITE_REPO_URL as string | undefined) ?? 'https://github.com/';

/** Worlds that orbit the Sun, innermost first, for ordering the pickers. */
export const SUN_ORBIT_ORDER = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'ceres',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'haumea',
  'makemake',
  'eris',
];

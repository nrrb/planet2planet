/** Display configuration. Business rules stay in the API. */
export const DEFAULT_FROM = 'jupiter';
export const DEFAULT_TO = 'saturn';
/** The GitHub repository, set with VITE_REPO_URL. Without it, links to the code are shown as plain paths. */
export const REPO_URL: string | null =
  (import.meta.env.VITE_REPO_URL as string | undefined)?.replace(/\/$/, '') || null;

/** A link to a file in the repository, at a commit when one is given. Null when no repository is configured. */
export function repoLink(path: string, commit?: string, base: string | null = REPO_URL): string | null {
  if (!base) return null;
  return `${base}/blob/${commit ?? 'main'}/${path}`;
}

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

/** Display configuration. The pricing and routing rules live in the engine (src/engine). */
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

/**
 * Files in the repository that the site links to. A test checks that each one exists.
 * Only the script is linked at a commit (the one that made the data). The data files and the derivation
 * document are linked on main, because the exported data is committed after the script that produced it,
 * so a link to them at the script's commit is a 404.
 */
export const REPO_FILES = {
  script: 'tools/colonization-sim.js',
  dataset: 'data/sol-telecom-2380.json',
  monteCarlo: 'data/sol-montecarlo-2380.json',
  derivation: 'docs/sol-telecom-2380-derivation.md',
} as const;

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

/** Who made the site, and where its source lives. Always shown in the footer, whatever VITE_REPO_URL says. */
export const AUTHOR = { name: 'Nicholas Bennett', url: 'https://nicholasbennett.work/' } as const;
export const SOURCE_URL = 'https://github.com/nrrb/planet2planet';

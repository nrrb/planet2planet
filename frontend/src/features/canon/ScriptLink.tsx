import { REPO_URL, repoLink } from '../../config';

const SCRIPT = 'tools/colonization-sim.js';

/** Links to the simulation script at the exact commit that made the data, so page and code match. */
export function ScriptLink({
  commit,
  label = 'Read the simulation script',
  base = REPO_URL,
}: {
  commit: string;
  label?: string;
  /** The repository URL; defaults to VITE_REPO_URL. Null shows the path as plain text. */
  base?: string | null;
}) {
  const url = repoLink(SCRIPT, commit, base);
  const short = commit.slice(0, 7);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {label} <span className="figure">{SCRIPT}</span> at commit <span className="figure">{short}</span> (opens in a new
      tab)
    </a>
  ) : (
    <span>
      {label}: <span className="figure">{SCRIPT}</span> at commit <span className="figure">{short}</span>
    </span>
  );
}

import { repoLink } from '../../config';

const SCRIPT = 'tools/colonization-sim.js';

/** Links to the simulation script at the exact commit that made the data, so page and code match. */
export function ScriptLink({ commit, label = 'Read the simulation script' }: { commit: string; label?: string }) {
  const url = repoLink(SCRIPT, commit);
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

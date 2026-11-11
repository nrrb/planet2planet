# ADR 0004: Data pipeline and canon export

Status: accepted (M7, M9)

## Decision

The world's history is produced once, by `tools/colonization-sim.js`, and the backend only loads it.

- The script is deterministic by seed. Seed 1701 is the canonical run the site shows. A Monte Carlo run
  of 400 seeds (1000 to 1399) summarises how much the history could have varied.
- `--export` writes `sol-telecom-2380.json` and `sol-montecarlo-2380.json` into `backend/data/`. Both are
  stamped with the git commit of the script that wrote them.
- `load_simulation` refuses files whose commit does not match each other. `load_canon_facts` refuses any
  fact that has no source. This keeps the Canon page honest: a number on screen either has an on-screen
  source or is labelled as invented.
- The Canon page links to the script at the recorded commit, so a reader can read exactly the code that
  produced what they see.

## Consequences

- Rewriting history changes the commit, so the data files must be re-exported afterwards. Export from a
  committed script, never a dirty tree.
- Invented content (prices, companies, the conjunction rule) is labelled as invented in the interface and
  in the data, so it is never mistaken for canon.
- The backend has no random behaviour at request time. The same database gives the same answers.

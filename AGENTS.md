# Planet2Planet: guide for coding agents

A comparison-shopping site for fictional interplanetary telecom plans in the Star Trek universe, 2380. Fan
work. It is a **static site**: React + TypeScript + Vite, with all data and logic running in the browser.

## Read first

- `docs/adr/0007-static-hosting.md`: why there is no backend, and how the engine maps to the old one.
- `README.md`: commands and layout.
- `PLAN.md` and ADRs 0001 to 0006: history. They describe the original full-stack design. Where they say "the
  backend", the code is now in `frontend/src/engine/`.

## The two versions of this project

- `main` (this branch): static, deployed on Vercel (planet2planet.com).
- `full-stack-aws`: the original Django + PostgreSQL + Docker + AWS version, **frozen** as a reference
  example. Do not merge `main` into it, do not update it to match `main`, and do not copy its backend back into
  `main` without being asked.

## Where things are

- `frontend/src/engine/`: the in-browser backend: catalog, network and routing, pricing, quotes, canon.
- `frontend/src/api/`: `client.ts` (the data access layer, with a swappable transport), `hooks.ts` (TanStack Query),
  `types.ts` and `schema.d.ts` (response shapes, now maintained by hand).
- `frontend/src/features/`, `pages/`: the UI. `map/` and `model/`: the Pixi map and the Kepler maths.
- `data/`: the committed inputs. Simulation exports, canon facts, orbital CSVs and `pricing.json`.
- `tools/colonization-sim.js`: the seeded simulation that makes `data/sol-*.json` (`--export` writes to `data/`).
- `e2e/`: Playwright tests, the link-preview and README screenshot generators.

## Commands

```sh
cd frontend && npm install
npm run dev            # dev server
npm test               # unit and component tests, including the engine
npm run lint && npm run format:check && npx tsc --noEmit
npm run build && npm run size    # production build, then the bundle budgets
make e2e               # browser tests (Chromium and WebKit)
```

## Rules that are easy to break

- **The engine must keep matching the reference output.** `frontend/src/engine/__golden__/` holds what the Django
  backend answered. If `engine.spec.ts` fails after an engine change, either the change is a bug or the reference
  must be deliberately regenerated (say so in the commit). Python-compatible rounding lives in `engine/util.ts`:
  use `pyRound` and `pyRoundTo`, not `Math.round` or `toFixed`, for anything that reaches a price, an id or a label.
  Offer ids are SHA-1 hashes that appear in shared URLs, so they must not change.
- **Plans, prices and company relationships are invented.** Canon facts are not. Anything canon needs a source
  in `data/canon-facts.json`. Keep the "unofficial fan work" disclaimer. No Star Trek logos, insignia or imagery.
- **The first-page bundle has a budget** (`frontend/scripts/check-bundle.mjs`), and the map renderer, the engine
  and the data files must stay lazy-loaded. Import data with `import()`, never statically, outside `engine/`.
- **Data files in `data/` are generated.** Do not hand-edit `sol-telecom-2380.json` or `sol-montecarlo-2380.json`.
  Change `tools/colonization-sim.js` and re-export, which stamps both with the script's git commit. `pricing.json`
  is the exception: it is meant to be edited.
- **Nothing is sold and nothing is sent anywhere.** There is no server to call. Do not add a backend, an analytics
  call or a form that posts. The inquiry form was removed on purpose.
- UI changes need the e2e visual baselines refreshed on macOS (`make e2e-update`). Other platforms skip them.

## Style

Prettier and ESLint are enforced (`npm run lint`, `npm run format:check`). Commit messages are short and in the
imperative. This repository is public: keep personal details and session links out of commits and files.

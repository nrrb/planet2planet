# ADR 0007: Static hosting, with the backend moved into the browser

Status: accepted. Supersedes [ADR 0006](0006-aws-deployment.md).

## Context

Planet2Planet began as a full-stack portfolio piece: Django REST Framework, PostgreSQL, React, Docker and
an AWS Lightsail deployment (ADRs 0002 to 0006). The backend existed to hold data and compute answers the way
a real shop's server would. Nothing is sold, and the "request this plan" form only stored an inquiry. Once the
application had served its purpose, the AWS bill was the only reason left to keep the server.

## Decision

1. **The site is a static build.** `vite build` produces files that any static host can serve. It is hosted on
   Vercel at planet2planet.com, configured by `vercel.json`, and deploys when `main` is pushed. There is no server, database
   or container.
2. **The full-stack version is kept, frozen, on the `full-stack-aws` branch.** It is a reference example of that
   architecture (Django, DRF, PostgreSQL, Docker Compose, Caddy, Lightsail, OpenAPI-generated types). It is not kept
   in sync with `main`. Do not port changes into it, and do not "fix" it to match `main`.
3. **The backend's logic now runs in the browser, in `frontend/src/engine/`.** The client still asks for the same
   paths the server used to answer (`/api/quotes/?from=jupiter&to=saturn`), so hooks, components and response types
   did not change. `api/client.ts` sends each request through a transport. In the browser the transport is
   `engine/router.ts`, which computes the reply. In tests it is the stubbed `fetch` that component specs already used
   (`test-setup.ts`).
4. **The inquiry form is removed**, with its API, the "Request" buttons and the dialog. It was the one UI change.
   Nothing can be ordered, so nothing has to be stored.

## How the engine maps to the old backend

| Engine (`frontend/src/engine/`) | Was (on `full-stack-aws`) |
| --- | --- |
| `catalog.ts` | `apps/catalog` serializers and views: worlds, regions, companies, history, meta |
| `network.ts`, `routing.ts`, `ephemeris.ts` | `apps/network`: node and link generation, orbital positions, shortest and diverse paths, conjunction windows |
| `offers.ts`, `formula.ts`, `quotes.ts` | `apps/pricing`: plans, packages, the price formula, filters, sorting, badges |
| `canon.ts` | `apps/canon`: canon facts, the Monte Carlo summary, per-world statistics |
| `router.ts`, `index.ts` | URL routing and the database; data loads on demand |

The data the engine reads is committed in `data/`: the simulation's two JSON exports, `canon-facts.json`, the orbital
element and moon phase CSVs, and `pricing.json` (see below). Big files are imported dynamically, so the first page
stays inside its budget and the Canon page's 320 KB of Monte Carlo data loads only there.

### Why the output is trusted

The port was checked against the running Django backend. Every ordered pair of the 33 worlds (1,056 quotes,
26,896 offers), the whole catalog, the network, the canon and simulation endpoints, and 248 filtered, sorted and
invalid queries matched exactly: ids, prices, breakdown lines, latencies and routes.

`frontend/src/engine/__golden__/` keeps a small version of that reference output: complete responses for the small
endpoints and twelve pairs, and digests for the rest. `engine.spec.ts` runs against it. To compare all 1,056 pairs,
run `GOLDEN_FULL_DIR=<dump> npm test`. `frontend/scripts/make-golden.mjs` rebuilds the fixtures from a dump of the
`full-stack-aws` branch's API.

### Deliberate differences

- **Tie-breaking is deterministic.** When two carriers have identical-cost links, the old code's choice depended on
  the iteration order of a Python `frozenset` of strings, which changes with the process's hash seed. The engine
  considers links in slug order instead. The reference output was regenerated with the same rule, so the two agree.
- **Pricing inputs are data.** `data/pricing.json` holds the price parameters, the plan templates and each
  company's price positioning. It was exported from the backend at commit `96456a8`. Positioning came from Python's
  seeded `random.Random` (seed 2380), and reproducing that generator in TypeScript was not worth it. To change a
  price, edit the file.
- **Quotes are computed per request, in the browser**, in roughly 50 ms each on a laptop. Results are not cached
  between filter changes in the engine; the query cache in `api/hooks.ts` does that.
- The `rate limit`, the admin site and the health check have no equivalent, as there is no server.

## Consequences

- Hosting is on Vercel's free tier, there is nothing to patch, and the AWS resources can be deleted. Deployment needs
  no command: Vercel builds on every push.
- `frontend/src/api/schema.d.ts` was generated from the backend's OpenAPI document. It is now the hand-maintained
  description of the data shapes. The OpenAPI file lives on `full-stack-aws`.
- To change the dataset, run `node tools/colonization-sim.js 1701 400 --export` (it writes to `data/`), then run the
  tests. The engine builds the network and plans from the files at load, so there is no seed step.
- The pre-existing ADRs (0002 to 0004 especially) describe the backend's design. They are still the best account of
  why the model is the way it is, and they remain accurate for the logic in `engine/`. Read "the backend" in them as
  "the engine".

# ADR 0005: Testing strategy and visual snapshots

Status: accepted (M9)

## Layers

1. **Unit and component** (Vitest, pytest, `node --test`): fast, run on every push.
2. **End to end** (Playwright): the real API and the real Vite server, in four projects: a Pixel 7, an
   820 px tablet, a 1440 px desktop and an iPhone 14 in WebKit. Headless WebKit may have no WebGL, so the
   map specs tolerate that and the app must still work without a map.
3. **Accessibility** (axe, WCAG 2.2 AA): every page, in both colour schemes, plus no sideways page scroll.
4. **Visual snapshots** (`@visual`): the Compare page and the route-map dialog, in both schemes, with
   reduced motion so the maps hold still.

## Ruling on visual snapshots

Pixel baselines depend on the platform's fonts and GPU stack, so a baseline made on macOS never matches
Linux. We commit macOS baselines (`*-darwin.png`), run them locally, and **skip `@visual` in CI**
(`--grep-invert @visual`). If Linux baselines are ever committed, drop the skip.

Refresh baselines with `make e2e-update` and review the image diff before committing.

## Why the e2e suite runs two workers

Maps use software-rendered WebGL in CI and on laptops. Four workers made pages compete for the CPU and
caused timeouts, so the config uses two, and map specs call `test.slow()`.

## What the browser tests have caught

Two quick URL changes overwriting each other, stale plans shown under a new pair of worlds, a Canon chart
that made phone pages scroll sideways, controls under the 24 px target size, scroll regions a keyboard
could not reach, and dialogs that did not return focus in Safari. Each has a unit or e2e test.

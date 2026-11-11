# ADR 0001: Reuse and extend the existing map code

Status: accepted (M1 review)

## Context

PLAN.md section 11.3 requires a review of `frontend/` before UI work. The three maps
(route dialog, About network map, Canon history map) must build on it.

## Findings

- **Rendering:** Pixi.js 8 (WebGL canvas) inside React 19, built with Vite 6. Scene class:
  `src/rendering/SolarSystemScene.ts`; React wrapper: `src/components/SolarSystemMap.tsx`.
- **Input data:** a static `src/data/bodies.json` catalog of 30 bodies (8 planets plus
  moons), each with a circular orbit (radius, period, phase, direction). Positions are
  computed in the client from a simulation clock (`model/orbits.ts`). Scale is schematic
  (`model/scaling.ts`), not true distance.
- **Interaction:** click to pick origin and destination (`model/selection.ts`), pan, wheel
  and pinch zoom, camera follow, pointer capture, resize handling, hidden-tab pause.
- **Animation:** Pixi ticker. Play, pause and speed controls. `prefers-reduced-motion` stops
  the clock and disables effects.
- **Links:** one `connectionLayer` Graphics draws a single origin-to-destination line.
- **Tests:** 9 node:test model tests and 4 Python data tests, all passing.
- **Accessibility:** controls are native elements with status regions; the canvas has an
  `aria-label` pointing at the adjacent selectors.

## Gaps against the plan

1. Only 30 bodies; the plan has 33 worlds. Positions stay client-side: they are aesthetic,
   so the scene keeps its own clock and orbit model and animates smoothly with no per-frame
   backend data. The client adopts the backend's Kepler model: it receives orbital elements
   (planets, dwarf planets) and moon orbit radius, period and phase from the API, solves
   Kepler's equation itself, and then applies its existing logarithmic radial scaling, which
   is display-only and keeps the true angle. The backend sends the site date as an
   occasional anchor to rebase the clock (ruling, M1 follow-up). The three missing worlds are added to the client catalog.
2. No layered links (access, mesh, backbone, cross-link, conjunction), no per-segment
   colour, labels, hover or tap, no dimming, no flow animation.
3. No year-driven state for the Canon history map.
4. No text alternative for a route or for the whole network.

## Decision

Keep Pixi and the existing scaling, camera and selection code; replace the circular orbit
math in `model/orbits.ts` with a Kepler solver fed by API elements. Add `src/map/adapter.ts` (API links and offer segments to scene input; positions are not part of it)
and extend the scene in small commits: a multi-layer link
renderer, dimming, flow animation, then hover and tap events. Text alternatives live in
React outside the canvas. The map moves into the new app shell without a rewrite.

## Consequences

Risk from PLAN.md section 18 item 1 is reduced: the renderer already handles resize,
touch and reduced motion. The remaining work is link rendering and data wiring (M6).

## Outcome (M6)

The plan above changed once the code was read in full. `SolarSystemScene` is tied to its own
30-body catalog, circular orbits and origin/destination selection UI, so extending it would
have meant rewriting most of it. **Ruling:** a new `NetworkScene` (`src/map/`) is driven only
by API data, and reuses the existing `Camera` and the logarithmic scaling constants. The
Kepler solver is in `src/map/kepler.ts`, checked against a fixture exported from the backend
ephemeris to about 1e-8 AU. The old prototype files (`SolarSystemScene`, `SolarSystemMap`,
`MapControls`, `bodies.json`, their tests) are still in the repository but nothing imports
them; they can be removed once the history map (M8) is done.

Layers differ by line style as well as colour, traffic direction shows as moving dashes or,
with motion off, as a chevron on each link, and the map is a keyboard-operable widget with the
route listed as text beneath it.

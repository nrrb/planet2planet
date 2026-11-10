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

1. Only 30 bodies; the plan has 33 worlds (adds dwarf planets and others) and positions at
   a fixed site date from the API. The scene must accept API positions instead of its own clock.
2. No layered links (access, mesh, backbone, cross-link, conjunction), no per-segment
   colour, labels, hover or tap, no dimming, no flow animation.
3. No year-driven state for the Canon history map.
4. No text alternative for a route or for the whole network.

## Decision

Keep Pixi and the existing model code. Add `src/map/adapter.ts` (API data to scene input)
and extend the scene in small commits: a position override, then a multi-layer link
renderer, dimming, flow animation, then hover and tap events. Text alternatives live in
React outside the canvas. The map moves into the new app shell without a rewrite.

## Consequences

Risk from PLAN.md section 18 item 1 is reduced: the renderer already handles resize,
touch and reduced motion. The remaining work is link rendering and data wiring (M6).

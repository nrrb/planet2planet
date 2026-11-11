# ADR 0002: Network model

Status: accepted (M3)

PLAN.md section 5 leaves a few things open. These rulings fix them. All of the network is
invented for the product; none of it is canon.

## Nodes

- One **constellation** node per world (33), `c-<world>`.
- One **hub** per region (10), `h-<region>`, positioned at the region's anchor world:
  Venus (inner), Earth, Mars, Ceres, Jupiter, Saturn, Uranus, Neptune, Pluto, Eris.
- Four fixed **conjunction relays**, `r-1` to `r-4`, 0.5 AU above or below the ecliptic near
  the Sun. A segment from anywhere to such a relay clears the Sun by about 0.35 AU or more.

## Links belong to companies

Section 5.2 gives mesh links to "the regional carrier, or the backbone that opened the
region", but section 6 has every backbone sell end to end wherever it reaches. Both hold if
each company owns its own links. **Ruling:** every active or division company that serves a
world owns:

- an **access** link (gateways) or **mesh** link (everyone else) from the world's
  constellation to its region hub, plus mesh links between neighbouring moons it serves;
- **backbone** links between the hubs of consecutive regions it covers along the
  heliocentric chain (not for gateways);
- backbones only: **cross-links** (Earth-Luna to Jovian, Mars to Saturnian, Jovian to
  Neptunian) where covered, and **conjunction** links from each covered hub to every relay.

Merged companies own nothing. Routing for an offer uses only the links of its allowed
carriers (lead carrier, its divisions and contracted partners), so the multigraph never
leaks a competitor's links into an offer.

## Latency and conjunction

- Propagation is straight-line distance at the site date divided by 52,000 c. Per-hop
  processing: 0.5 ms (access, mesh), 1.5 ms (backbone, cross, conjunction); 3 ms per change
  of carrier.
- A link is degraded when its straight segment passes within 0.1 AU of the Sun (3D, since
  relays sit off the ecliptic).
- The next conjunction window of a pair is found by daily steps from the site date, over a
  four-year horizon. Far pairs may have none inside it, and the API says so.

## Diverse paths

The second path avoids every intermediate hub of the first (hubs of the endpoint regions are
shared, since all traffic enters and leaves through them) and avoids the first path's
backbone operators.

## Ephemeris

JPL Tables 2a/2b for planets (valid to 3000 AD) and SBDB elements for dwarf planets, solved
in 2D. Moons are on circular orbits at invented fixed phases. The client map reads the same
elements (ADR 0001).

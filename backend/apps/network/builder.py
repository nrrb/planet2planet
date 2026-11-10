"""Generate nodes and links from the catalog (ADR 0002). Deterministic and idempotent."""

from collections import defaultdict

from django.db import transaction

from apps.catalog.models import Company, Region, World

from .models import Link, Node

# Heliocentric chain of regions, innermost first (PLAN.md 5.2).
REGION_CHAIN = [
    "inner",
    "earth-luna",
    "mars",
    "belt",
    "jovian",
    "saturnian",
    "uranian",
    "neptunian",
    "plutonian",
    "far-kuiper",
]
REGION_ANCHOR = {
    "inner": "venus",
    "earth-luna": "earth",
    "mars": "mars",
    "belt": "ceres",
    "jovian": "jupiter",
    "saturnian": "saturn",
    "uranian": "uranus",
    "neptunian": "neptune",
    "plutonian": "pluto",
    "far-kuiper": "eris",
}
CROSS_LINKS = [("earth-luna", "jovian"), ("mars", "saturnian"), ("jovian", "neptunian")]
# Fixed conjunction relays, AU. Far enough off the ecliptic that a segment from any world
# clears the Sun by well over the 0.1 AU conjunction threshold.
RELAYS = {
    "r-1": (0.5, 0.0, 0.5),
    "r-2": (-0.5, 0.0, 0.5),
    "r-3": (0.0, 0.5, -0.5),
    "r-4": (0.0, -0.5, -0.5),
}
MESH_MS, BACKBONE_MS = 0.5, 1.5


@transaction.atomic
def build_network() -> dict[str, int]:
    Link.objects.all().delete()
    Node.objects.all().delete()

    worlds = {w.slug: w for w in World.objects.all()}
    regions = {r.slug: r for r in Region.objects.all()}
    nodes = [
        Node(slug=f"c-{w.slug}", kind=Node.Kind.CONSTELLATION, world=w, region=w.region)
        for w in worlds.values()
    ]
    nodes += [
        Node(
            slug=f"h-{slug}",
            kind=Node.Kind.HUB,
            world=worlds[REGION_ANCHOR[slug]],
            region=regions[slug],
        )
        for slug in REGION_CHAIN
    ]
    nodes += [
        Node(slug=slug, kind=Node.Kind.RELAY, fixed_x=x, fixed_y=y, fixed_z=z)
        for slug, (x, y, z) in RELAYS.items()
    ]
    Node.objects.bulk_create(nodes)

    moons_by_parent: dict[str, list[World]] = defaultdict(list)
    for w in worlds.values():
        if w.parent_id:
            moons_by_parent[w.parent_id].append(w)
    for moons in moons_by_parent.values():
        moons.sort(key=lambda m: m.orbit_radius_km or 0)

    links: list[Link] = []

    def add(layer, a: str, b: str, company: Company, since: int, ms: float, capacity: str):
        links.append(
            Link(
                slug=f"{layer}-{company.slug}-{a}-{b}",
                layer=layer,
                a_id=a,
                b_id=b,
                operator=company,
                established=max(company.founded, since),
                processing_ms=ms,
                hardened=bool(company.environment),
                capacity_class=capacity,
            )
        )

    def hub_since(region: str) -> int:
        return worlds[REGION_ANCHOR[region]].subspace_since or 0

    companies = Company.objects.exclude(status=Company.Status.MERGED).prefetch_related(
        "service_areas"
    )
    for company in companies:
        served = {a.world_id for a in company.service_areas.all()}
        if not served:
            continue
        is_gateway = company.kind == Company.Kind.GATEWAY

        for slug in sorted(served):
            w = worlds[slug]
            layer = Link.Layer.ACCESS if is_gateway else Link.Layer.MESH
            add(
                layer,
                f"c-{slug}",
                f"h-{w.region_id}",
                company,
                w.subspace_since or 0,
                MESH_MS,
                "access" if is_gateway else "regional",
            )
        for moons in moons_by_parent.values():
            for near, far in zip(moons, moons[1:], strict=False):
                if near.slug in served and far.slug in served:
                    add(
                        Link.Layer.MESH,
                        f"c-{near.slug}",
                        f"c-{far.slug}",
                        company,
                        max(near.subspace_since or 0, far.subspace_since or 0),
                        MESH_MS,
                        "regional",
                    )
        if is_gateway:
            continue

        covered = [r for r in REGION_CHAIN if any(worlds[s].region_id == r for s in served)]
        for r1, r2 in zip(covered, covered[1:], strict=False):
            add(
                Link.Layer.BACKBONE,
                f"h-{r1}",
                f"h-{r2}",
                company,
                max(hub_since(r1), hub_since(r2)),
                BACKBONE_MS,
                "trunk",
            )
        if company.kind != Company.Kind.BACKBONE:
            continue
        for r1, r2 in CROSS_LINKS:
            if r1 in covered and r2 in covered:
                add(
                    Link.Layer.CROSS,
                    f"h-{r1}",
                    f"h-{r2}",
                    company,
                    max(hub_since(r1), hub_since(r2)),
                    BACKBONE_MS,
                    "trunk",
                )
        for region in covered:
            for relay in RELAYS:
                add(
                    Link.Layer.CONJUNCTION,
                    f"h-{region}",
                    relay,
                    company,
                    hub_since(region),
                    BACKBONE_MS,
                    "trunk",
                )

    Link.objects.bulk_create(links)
    return {"nodes": len(nodes), "links": len(links)}

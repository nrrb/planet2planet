"""Pricing vocabulary and defaults. Everything here is invented for the product (PLAN.md 6);
none of it is Star Trek canon. Defaults are loaded into PricingParameter and can be edited in
Django admin.
"""

SERVICE_CLASSES = ["shared", "dedicated", "synchronized"]
TIERS = ["standard", "diverse-path", "hardened", "contingency", "terraforming-zone"]
# Higher means more resilient; used for sorting.
TIER_RANK = {
    "standard": 0,
    "hardened": 1,
    "diverse-path": 2,
    "terraforming-zone": 3,
    "contingency": 4,
}
ENVIRONMENTS = ["radiation", "cryogenic", "solar", "gas-giant-orbit"]
SECTORS = ["science", "commercial", "industrial"]
KINDS = ["backbone", "regional", "gateway", "specialist"]
TERMS = ["monthly", "1-year", "3-year"]
TERM_DISCOUNTS = {"monthly": 1.0, "1-year": 0.92, "3-year": 0.82}

# Hardening a world needs, by world (invented). Surcharges apply once per distinct environment
# required at either end of a route.
RADIATION_WORLDS = {"io", "europa", "ganymede", "callisto"}
GAS_GIANT_WORLDS = {"jupiter", "saturn", "uranus", "neptune"}
COLD_REGIONS = {"uranian", "neptunian", "plutonian", "far-kuiper"}
SOLAR_REGIONS = {"inner"}


def required_environments(world_slug: str, region_slug: str) -> set[str]:
    needed = set()
    if world_slug in RADIATION_WORLDS:
        needed.add("radiation")
    if world_slug in GAS_GIANT_WORLDS:
        needed.add("gas-giant-orbit")
    if region_slug in COLD_REGIONS:
        needed.add("cryogenic")
    if region_slug in SOLAR_REGIONS:
        needed.add("solar")
    return needed


DEFAULT_PARAMETERS: dict[str, tuple[float, str]] = {
    "class.shared": (1.0, "Service class factor: shared"),
    "class.dedicated": (1.8, "Service class factor: dedicated"),
    "class.synchronized": (2.6, "Service class factor: synchronized"),
    "throughput.reference": (10, "Throughput (gigaquads/s) at which the factor is 1"),
    "throughput.exponent": (0.5, "Throughput factor = (throughput / reference) ** exponent"),
    "transit.per_hop_rate": (120, "Credits per backbone hop"),
    "transit.length_coefficient": (0.15, "Hop length factor = 1 + coefficient * ln(1 + AU)"),
    "handoff.fee": (150, "Credits per change of carrier"),
    "competition.max": (1.35, "Market factor with one independent carrier"),
    "competition.min": (0.85, "Market factor floor"),
    "competition.floor_at": (5, "Carriers at which the floor is reached"),
    "market.tiny_population": (10_000, "Below this, the tiny factor applies"),
    "market.small_population": (100_000, "Below this, the small factor applies"),
    "market.mid_population": (1_000_000, "Below this, the mid factor applies"),
    "market.tiny_factor": (1.15, "Market-size factor, tiny end"),
    "market.small_factor": (1.08, "Market-size factor, small end"),
    "market.mid_factor": (1.0, "Market-size factor, mid-size end"),
    "market.large_factor": (0.95, "Market-size factor, large end"),
    "environment.radiation": (0.20, "Surcharge where radiation hardening is required"),
    "environment.cryogenic": (0.15, "Surcharge where cryogenic hardening is required"),
    "environment.solar": (0.15, "Surcharge where solar hardening is required"),
    "environment.gas-giant-orbit": (0.10, "Surcharge for gas-giant orbit hardening"),
    "resilience.standard": (1.0, "Tier multiplier"),
    "resilience.diverse-path": (1.45, "Tier multiplier"),
    "resilience.hardened": (1.3, "Tier multiplier"),
    "resilience.contingency": (1.9, "Tier multiplier"),
    "resilience.terraforming-zone": (1.25, "Tier multiplier"),
    "resilience.reroute_fee": (0.12, "Added to the tier multiplier when rerouting is included"),
    "family.discount": (0.05, "Discount for a package within one corporate family"),
    "addon.hardening_pct": (0.18, "Hardening add-on as a share of the monthly price"),
    "packages.per_transit": (3, "Most packages offered per transit carrier"),
}

# (code, name, class, throughput, monthly base, setup fee, tier, reroute, standalone, role)
TEMPLATES: dict[str, list[tuple]] = {
    "backbone": [
        (
            "transit-shared",
            "Transit Shared",
            "shared",
            10,
            400,
            300,
            "standard",
            False,
            True,
            "transit",
        ),
        (
            "transit-dedicated",
            "Transit Dedicated",
            "dedicated",
            20,
            400,
            600,
            "standard",
            False,
            True,
            "transit",
        ),
        (
            "synchronized-trunk",
            "Synchronized Trunk",
            "synchronized",
            40,
            420,
            900,
            "standard",
            False,
            True,
            "transit",
        ),
        (
            "diverse-path",
            "Diverse Path",
            "dedicated",
            20,
            400,
            800,
            "diverse-path",
            True,
            True,
            "transit",
        ),
        (
            "contingency",
            "Contingency",
            "dedicated",
            20,
            400,
            1200,
            "contingency",
            True,
            True,
            "transit",
        ),
    ],
    "regional": [
        (
            "regional-shared",
            "Regional Shared",
            "shared",
            8,
            300,
            200,
            "standard",
            False,
            True,
            "regional",
        ),
        (
            "regional-dedicated",
            "Regional Dedicated",
            "dedicated",
            16,
            300,
            450,
            "standard",
            False,
            True,
            "regional",
        ),
    ],
    "gateway": [
        ("access-basic", "Access Basic", "shared", 4, 120, 100, "standard", False, False, "access"),
        ("access-pro", "Access Pro", "dedicated", 10, 120, 200, "standard", False, False, "access"),
    ],
}

# Specialist niche plans, by company: (code, name, class, throughput, base, setup, tier, role)
SPECIALIST_PLANS: dict[str, list[tuple]] = {
    "arcadia-terraforming-control": [
        (
            "terraforming-shield",
            "Terraforming Shield",
            "dedicated",
            12,
            380,
            700,
            "terraforming-zone",
            "specialist",
        ),
    ],
    "valles-yard-logistics": [
        (
            "yard-logistics",
            "Yard Logistics Link",
            "dedicated",
            12,
            340,
            500,
            "standard",
            "specialist",
        )
    ],
    "himalia-hardened-relay": [
        ("hardened-relay", "Hardened Relay", "dedicated", 14, 380, 650, "hardened", "specialist")
    ],
    "loki-mining-telemetry": [
        (
            "mining-telemetry-ops",
            "Mining Telemetry Ops",
            "shared",
            3,
            260,
            300,
            "hardened",
            "specialist",
        )
    ],
    "ceres-mining-telemetry": [
        (
            "mining-telemetry-ops",
            "Mining Telemetry Ops",
            "shared",
            3,
            260,
            300,
            "hardened",
            "specialist",
        )
    ],
    "kraken-mining-telemetry": [
        (
            "mining-telemetry-ops",
            "Mining Telemetry Ops",
            "shared",
            3,
            260,
            300,
            "hardened",
            "specialist",
        )
    ],
    "sycorax-mining-telemetry": [
        (
            "mining-telemetry-ops",
            "Mining Telemetry Ops",
            "shared",
            3,
            260,
            300,
            "hardened",
            "specialist",
        )
    ],
    "pele-traffic-control": [
        (
            "traffic-control-sync",
            "Traffic Control Sync",
            "synchronized",
            10,
            340,
            600,
            "standard",
            "specialist",
        )
    ],
    "prospero-traffic-control": [
        (
            "traffic-control-sync",
            "Traffic Control Sync",
            "synchronized",
            10,
            340,
            600,
            "standard",
            "specialist",
        )
    ],
    "xanadu-navigation": [
        ("navigation-feed", "Navigation Feed", "shared", 6, 280, 250, "standard", "specialist")
    ],
    "conamara-ocean-research": [
        ("research-bulk", "Research Bulk", "shared", 60, 300, 400, "standard", "specialist")
    ],
    "ontario-research-network": [
        ("research-bulk", "Research Bulk", "shared", 60, 300, 400, "standard", "specialist")
    ],
    "le-verrier-deep-field": [
        ("research-bulk", "Research Bulk", "shared", 60, 300, 400, "standard", "specialist")
    ],
    "caloris-solar-relay": [
        ("solar-relay", "Solar Relay", "dedicated", 14, 360, 600, "hardened", "specialist")
    ],
    "maxwell-solar-observatory": [
        ("research-bulk", "Research Bulk", "shared", 60, 300, 400, "standard", "specialist")
    ],
    "nereid-cryo-relay": [
        ("cryo-relay", "Cryo Relay", "dedicated", 14, 360, 600, "hardened", "specialist")
    ],
    "selene-clearing": [
        ("clearing-sync", "Clearing Sync", "synchronized", 20, 360, 800, "standard", "specialist")
    ],
    "uruk-clearing": [
        ("clearing-sync", "Clearing Sync", "synchronized", 20, 360, 800, "standard", "specialist")
    ],
    "amalthea-fuel-logistics": [
        (
            "fuel-logistics",
            "Fuel Logistics Link",
            "dedicated",
            12,
            340,
            500,
            "standard",
            "specialist",
        )
    ],
    "galilean-station-link": [
        ("station-link", "Station Link", "dedicated", 12, 340, 500, "standard", "specialist")
    ],
    "equatorial-emergency-net": [
        ("emergency-priority", "Emergency Priority", "dedicated", 8, 220, 0, "contingency", "addon")
    ],
}

// Solar system colonization: an agent-based simulation in a Star Trek setting.
//
// Run:   node colonization-sim.js [seed] [monteCarloRuns]
//        node colonization-sim.js 1701 500
// Or load in a browser and call ColonizationSim.simulate({ seed: 42 }).
//
// Agents
//   Shipyard    Utopia Planitia, at Mars. The only place expeditions are built. It has a few
//               construction slips; each free slip may send out one expedition a year.
//   Colony      one per settled world. Grows industry and population each year. Colonies do
//               not launch expeditions; their mining output feeds the shipyard and adds slips.
//   Company     an interplanetary telecom company. Backbone carriers grow out of the four
//               pre-subspace networks; regional carriers, local gateways and specialists are
//               founded or spun off as worlds are settled and grow; some are later acquired.
//               The run ends with a snapshot of which companies serve which world.
//   Expedition  built at the shipyard and sent to one target world. Takes some years to set
//               up, then succeeds or fails on a dice roll that gets easier as technology improves.
//
// Order of events at a world: an expedition that succeeds first establishes the relay
// constellation (the parent planet's first, if the world is a moon). The colony follows
// some years later. A world is never colonized before it has a constellation.
//
// Constellations have a type. Worlds settled before subspace was in general use got a
// conventional (light-speed) constellation, later converted to subspace. Everything
// established from the start year onward is subspace from day one.
//
// Starting conditions use only dates stated on screen in Star Trek; everything else is
// produced by the simulation. Everything worth tuning is in CONFIG. The world data below is the "Colony candidates"
// sheet of solar-system-bodies.xlsx (33 bodies).

const CONFIG = {
  seed: 1701,
  startYear: 2151,                 // subspace communication in active use
  // The snapshot year. 2380 is chosen so the market is mature (it fills in by about 2350) while
  // staying clear of canon's later upheavals: the attack on Mars and the synthetics ban (2385),
  // the Romulan supernova (2387) and Frontier Day (2401).
  endYear: 2380,

  // Subspace relays. Before availableYear every constellation is conventional (light-speed).
  // Existing constellations convert at availableYear + (1 - industry) * legacyConversionSpanYears,
  // so the most developed worlds convert first. A moon's parent always converts just before it.
  subspace: { availableYear: 2151, legacyConversionSpanYears: 10 },
  // A legacy colony's conventional constellation is dated this many years before its founding,
  // unless the colony gives its own relayYear.
  legacyRelayLeadYears: 2,

  // Worlds already settled in 2151, limited to what is dated on screen (sources in the note).
  // founded: the year shown in the output (null for the homeworld). industry: 0 to 1 in 2151.
  // relayYear: when its conventional constellation went up (an assumption; canon gives no dates).
  startingColonies: {
    Earth:   { industry: 1.0, founded: null, relayYear: 1962, population: null, note: "homeworld" },   // 1962: Telstar 1, first active relay satellite
    Moon:    { industry: 0.7, founded: 2069, relayYear: 2067, population: 100000, note: "canon: New Berlin built between 2063 and 2069 (ENT Terra Nova)" },
    Mars:    { industry: 0.6, founded: 2103, relayYear: 2069, population: 60000, note: "canon: colonized 2103 (VOY The 37's); settlements by 2069 (ENT Terra Nova)" },
    Jupiter: { industry: 0.4, founded: 2151, relayYear: 2149, population: 2000, note: "canon: Jupiter Station in orbit by 2151 (ENT Fortunate Son); an orbital station, not a surface colony" },
  },

  lore: {
    // Added to a world's difficulty. Positive = later, negative = earlier. Empty: nothing is hand-fitted.
    difficulty: {},
    // Stations rather than cities: industry is capped, so they never launch expeditions. (An assumption.)
    outposts: ["Venus", "Mimas"],
    outpostIndustryCap: 0.25,
    // Latest dates canon allows, used only by the Monte Carlo report to check the tuning.
    targets: {
      Titan:    { event: "colonized", by: 2259, source: "mine on Titan by 2259 (SNW Memento Mori)" },
      Ganymede: { event: "colonized", by: 2268, source: "inhabited by 2268 (TOS By Any Other Name)" },
      Venus:    { event: "colonized", by: 2340, source: "pilot training on Venus in the 2340s (VOY Future's End, Part II)" },
      Mimas:    { event: "colonized", by: 2368, source: "evacuation station by 2368 (TNG The First Duty)" },
      Saturn:   { event: "constellation", by: 2368, source: "navigational control satellites by 2368 (TNG The First Duty)" },
      Moon:     { event: "population", atLeast: 50e6, by: 2373, source: "over 50 million on the Moon in 2373 (Star Trek: First Contact)" },
    },
  },

  // Constraint 1: travel gets easier and faster over time.
  // "Reach" is compared against a world's difficulty score; it rises every year.
  tech: { start: 1.5, perYear: 0.06 },

  // Constraint 3: what makes a world hard. Each weight multiplies one penalty.
  weights: {
    distance: 1.0,      // log2(1 + AU between the launching colony and the target)
    sunProximity: 3.0,  // how much closer to the Sun than Earth (0 at 1 AU and beyond)
    orbitalSpeed: 3.0,  // how much faster than Earth's orbital speed (0 at or below it)
    gravity: 2.0,       // how much stronger than Earth's surface gravity (0 at or below it)
    noSurface: 5.0,     // flat penalty for gas and ice giants
  },
  reference: { earthSpeedKmS: 29.78, earthGravity: 9.82 },
  // Subspace radio speed as a multiple of light speed. Canon: "approximately 52,000 times the
  // speed of light" (SNW All Those Who Wander); Data's figure in TNG Where No One Has Gone Before
  // works out to about 52,090. Used only for the latency figures in the exported dataset.
  subspaceSpeedC: 52000,
  allowGasGiantColonies: true,     // false: giants only ever get a relay constellation

  // Constraint 2: what makes a world worth it (warp fuel and shipbuilding materials).
  resources: {
    fuelIfHydrogen: 1.0,           // water ice and hydrogen are deuterium sources
    fuelIfGasGiant: 2.0,
    fuelIfMoonOfGiant: 0.75,       // a base for skimming the parent's atmosphere
    materials: { Fe: 1.0, Si: 0.5, Mg: 0.25, C: 0.25 },
  },

  // Estimated population of each colony. Everything here is an estimate except the Moon anchor:
  // canon gives over 50 million people on the Moon in 2373, and nothing else.
  // Each colony grows logistically toward a capacity set by its world.
  population: {
    founding: 5000,                // people at a new colony's first base
    baseRate: 0.028,               // growth per year in 2151: the rate that takes a small Moon base to 50 million in about 300 years
    rateDoublingYears: 150,        // growth rate rises linearly with technology, doubling by 2301
    growthSpread: 0.2,             // each colony's rate varies by up to +/-20% between runs
    referenceCapacity: 55e6,       // capacity of a Moon-like world in enclosed habitats
    referenceGravity: 1.62,        // the Moon's surface gravity, m/s^2. Capacity scales with (gravity / this)^3, capped at 1
    hazard: { Io: 0.02 },          // extra multiplier on capacity: Io's radiation and volcanism
    // Worlds whose capacity depends on terraforming. Before habitableFrom they hold only an outpost.
    terraforming: {
      Mars:  { habitableFrom: 2103, capacityMultiplier: 3 },   // canon: under way by 2155, lowlands without pressure suits
      Venus: { habitableFrom: 2401, capacityMultiplier: 3 },   // canon: still in progress in 2371; 30 years is the best case (TNG Home Soil)
    },
    outpostCapacity: 20000,        // Venus before terraforming, and Mimas
    orbitalStationCapacity: 50000, // giant planets: stations in orbit
    heavilyPopulated: 1e6,         // threshold for the "population passed 1 million" event
    snapshotYears: [2200, 2250, 2300, 2350, 2373, 2380],   // 2373: the canon Moon check; the last must equal endYear
  },

  // Telecom companies. Every number and name here is invented for the setting.
  // Companies use their own random stream, so they never change colonization or population.
  companies: {
    // Service regions. Every world belongs to exactly one.
    regions: {
      "Earth–Luna": ["Earth", "Moon"],
      Mars: ["Mars"],
      Jovian: ["Jupiter", "Io", "Europa", "Ganymede", "Callisto"],
      Inner: ["Mercury", "Venus"],
      Belt: ["Ceres"],
      Saturnian: ["Saturn", "Mimas", "Enceladus", "Tethys", "Dione", "Rhea", "Titan", "Iapetus"],
      Uranian: ["Uranus", "Miranda", "Ariel", "Umbriel", "Titania", "Oberon"],
      Neptunian: ["Neptune", "Triton"],
      Plutonian: ["Pluto", "Charon"],
      "Far Kuiper": ["Haumea", "Makemake", "Eris", "Dysnomia"],
    },
    // Backbone carriers: one per pre-subspace network, founded in that network's relay year.
    // They keep long-haul service to every region they opened, and compete in any region
    // whose population passes bigMarketPopulation.
    backbone: { homes: ["Earth", "Moon", "Mars", "Jupiter"], bigMarketPopulation: 500000 },
    // A regional carrier is spun off from the backbone that opened a region once the region
    // has this many people and its first hub is this many years old.
    regionalCarrier: { population: 50000, minYearsAfterHub: 20 },
    // Local gateways: the first when a world passes firstAt people, another for each perExtra
    // more, up to max. Earth's population is not modelled, so it gets a fixed number.
    gateways: { firstAt: 1e6, perExtra: 50e6, max: 6, earth: 5, foundingChance: 0.3 },
    spinOffChance: 0.45,           // chance a new gateway or specialist is a spin-off rather than a startup
    // Chance per year that a company older than minAge is bought. Regional carriers and backbones
    // are bought less often. Specialists and gateways are bought by their parent if it still
    // exists, otherwise by the carrier serving their home world; the brand lives on as a division.
    acquisitions: { rate: 0.0025, regionalRate: 0.0012, backboneRate: 0.0015, minAge: 20, minBackbones: 2 },

    // Specialist niches. A niche founds one company when its trigger is met; the company
    // serves every settled world in its list. trigger: colonized = how many of the listed
    // worlds (or of trigger.of) must be settled; population = combined people; minYear.
    niches: [
      { id: "terraforming", label: "Terraforming Control", sectors: ["industrial"], worlds: ["Mars", "Venus"], trigger: { colonized: 1, minYear: 2155 }, focus: "Control and telemetry links for terraforming projects" },
      { id: "yard", label: "Yard Logistics", sectors: ["industrial"], worlds: ["Mars"], trigger: { colonized: 1, minYear: 2160 }, focus: "Supply-chain network for the Utopia Planitia shipyard" },
      { id: "innerClearing", label: "Clearing", sectors: ["commercial"], worlds: ["Earth", "Moon", "Mars"], trigger: { population: 2e6 }, focus: "System clock and fast trade settlement between Earth, Luna and Mars" },
      { id: "outerClearing", label: "Clearing", sectors: ["commercial"], worlds: ["Ganymede", "Europa", "Callisto", "Titan", "Triton", "Pluto", "Eris"], trigger: { population: 5e6 }, focus: "Trade settlement and timekeeping for the outer-system markets" },
      { id: "beltMining", label: "Mining Telemetry", sectors: ["industrial"], worlds: ["Ceres"], trigger: { colonized: 1 }, focus: "Remote operation and telemetry for mining on Ceres" },
      { id: "jovianMining", label: "Mining Telemetry", sectors: ["industrial"], worlds: ["Io", "Europa", "Ganymede", "Callisto", "Jupiter"], trigger: { colonized: 3 }, focus: "Remote operation and telemetry for mining in the Jovian system" },
      { id: "saturnMining", label: "Mining Telemetry", sectors: ["industrial"], worlds: ["Titan", "Rhea", "Dione", "Tethys", "Iapetus", "Enceladus", "Mimas"], trigger: { colonized: 3 }, focus: "Remote operation and telemetry for mining on Saturn's moons" },
      { id: "outerMining", label: "Mining Telemetry", sectors: ["industrial"], worlds: ["Titania", "Oberon", "Umbriel", "Ariel", "Miranda", "Triton"], trigger: { colonized: 3 }, focus: "Remote operation and telemetry for mining on the moons of Uranus and Neptune" },
      { id: "fuel", label: "Fuel Logistics", sectors: ["industrial"], worlds: ["Jupiter", "Saturn", "Uranus", "Neptune"], trigger: { colonized: 2 }, environment: "gas giant orbit", focus: "Coordination of deuterium skimming and tankers at the gas giants" },
      { id: "ocean", label: "Ocean Research", sectors: ["science"], worlds: ["Europa", "Enceladus", "Ganymede", "Titan", "Triton", "Callisto"], trigger: { colonized: 2 }, focus: "Research network for the subsurface-ocean moons" },
      { id: "titanResearch", label: "Research Network", sectors: ["science"], worlds: ["Titan"], trigger: { colonized: 1 }, focus: "Links for the Titan research colony and its hydrocarbon studies" },
      { id: "deepField", label: "Deep Field", sectors: ["science"], worlds: ["Pluto", "Charon", "Eris", "Dysnomia", "Haumea", "Makemake", "Triton"], trigger: { colonized: 3 }, focus: "Observatory and deep-space science network at the edge of the system" },
      { id: "solarObservatory", label: "Solar Observatory", sectors: ["science"], worlds: ["Mercury", "Venus"], trigger: { colonized: 2 }, environment: "solar", focus: "Solar observation network on the inner planets" },
      { id: "jovianTraffic", label: "Traffic Control", sectors: ["industrial", "commercial"], worlds: ["Jupiter", "Io", "Europa", "Ganymede", "Callisto"], trigger: { colonized: 3 }, focus: "Navigation and traffic control around Jupiter Station and the Galilean moons" },
      { id: "saturnNav", label: "Navigation", sectors: ["industrial", "commercial"], worlds: ["Saturn", "Titan", "Rhea", "Dione", "Tethys", "Iapetus", "Enceladus", "Mimas"], trigger: { colonized: 3 }, focus: "Navigational control satellites in the Saturn system" },
      { id: "outerTraffic", label: "Traffic Control", sectors: ["industrial", "commercial"], worlds: ["Uranus", "Neptune", "Titania", "Oberon", "Triton", "Pluto", "Charon"], trigger: { colonized: 4 }, focus: "Navigation and traffic control beyond Saturn" },
      { id: "radiation", label: "Hardened Relay", sectors: ["science", "commercial", "industrial"], worlds: ["Io", "Europa", "Ganymede", "Callisto", "Jupiter"], trigger: { colonized: 1, of: ["Io"] }, environment: "radiation", focus: "Radiation-hardened relays for the Jovian system" },
      { id: "cryo", label: "Cryo Relay", sectors: ["science", "commercial", "industrial"], worlds: ["Triton", "Pluto", "Charon", "Eris", "Dysnomia", "Haumea", "Makemake"], trigger: { colonized: 2 }, environment: "cryogenic", focus: "Relays built for the extreme cold of the outer system" },
      { id: "stations", label: "Station Link", sectors: ["commercial"], worlds: ["Jupiter", "Saturn", "Uranus", "Neptune"], trigger: { colonized: 2 }, environment: "gas giant orbit", focus: "Service for the orbital stations around the gas giants" },
      { id: "solarRelay", label: "Solar Relay", sectors: ["science", "commercial", "industrial"], worlds: ["Venus", "Mercury"], trigger: { colonized: 1 }, environment: "solar", focus: "Relays hardened for heat and solar storms near the Sun" },
      { id: "emergency", label: "Emergency Net", sectors: ["science", "commercial", "industrial"], worlds: "*", trigger: { colonized: 1, of: ["Mimas"] }, focus: "System-wide emergency and evacuation communications" },
    ],

    // Name parts. Places are real surface features (or the world's own name).
    names: {
      backboneRoots: { Earth: ["Terran", "Gaia", "Meridian"], Moon: ["Selene", "Cislunar", "Tycho"], Mars: ["Ares", "Tharsis", "Utopia"], Jupiter: ["Galilean", "Jovian", "Amalthea"] },
      regionRoots: {
        "Earth–Luna": ["Terran", "Cislunar", "Selene", "Gaia"], Mars: ["Ares", "Tharsis", "Hellas", "Utopia"],
        Jovian: ["Galilean", "Jovian", "Amalthea", "Himalia"], Inner: ["Caloris", "Ishtar", "Maxwell", "Lakshmi"],
        Belt: ["Vesta", "Pallas", "Kirkwood", "Ceres"], Saturnian: ["Cassini", "Huygens", "Encke", "Keeler"],
        Uranian: ["Herschel", "Caelus", "Prospero", "Sycorax"], Neptunian: ["Le Verrier", "Galle", "Nereid", "Proteus"],
        Plutonian: ["Tombaugh", "Styx", "Kerberos", "Nix"], "Far Kuiper": ["Kuiper", "Edgeworth", "Scattered Disc", "Namaka"],
      },
      places: {
        Earth: ["Pacific", "Atlantic", "Boreal", "Austral", "Equatorial", "Andean", "Sahel"],
        Moon: ["Tycho", "New Berlin", "Armstrong", "Copernicus", "Clavius", "Tranquility"],
        Mars: ["Tharsis", "Hellas", "Elysium", "Arcadia", "Chryse", "Olympus", "Valles"],
        Ganymede: ["Galileo", "Uruk", "Memphis"], Callisto: ["Valhalla", "Asgard", "Heimdall"],
        Europa: ["Conamara", "Thera", "Pwyll"], Io: ["Loki", "Pele", "Tvashtar"],
        Titan: ["Kraken", "Ligeia", "Xanadu", "Ontario"], Triton: ["Cipango", "Tuonela"], Pluto: ["Burney", "Wright"],
      },
      suffixes: { backbone: ["Interplanetary", "Subspace", "Transit"], regional: ["Relay", "Comms", "Link"], gateway: ["Gateway", "Access", "Uplink"] },
    },
  },

  // Where expeditions come from. Distance to a target is measured from the shipyard world.
  shipyards: {
    worlds: ["Mars"],              // Utopia Planitia. Add "Earth" here for a second yard.
    baseSlips: 2,                  // expeditions that can be under way at once, per yard
    industryPerExtraSlip: 3,       // every 3 units of industry across the other colonies adds a slip
    maxSlips: 8,
    stagingDiscount: 0.75,         // difficulty taken off a target whose system already has a colony
  },
  launchRate: 0.5,                 // chance per year that a free slip sends out an expedition
  industryGrowth: 0.12,            // logistic growth rate per year
  // Years between a world's constellation going up and its colony being founded:
  // base - perReach * reach + (0 to jitter), kept between min and max. Shrinks as tech improves.
  colonyLag: { base: 7, perReach: 0.5, jitter: 3, min: 1, max: 10 },
  sameSystemHopAU: 0.05,           // effective distance between a planet and its moons
};

const BODIES = 
[
  {"name": "Mercury", "type": "Planet", "parent": "Sun", "au": 0.387, "gaseous": false, "radiusKm": 2439.7, "elements": ["Fe", "O", "Si", "Mg"], "orbitKm": 57909000.0, "periodDays": 87.969, "speedKmS": 47.87, "massKg": 3.3011e+23, "gravity": 3.7},
  {"name": "Venus", "type": "Planet", "parent": "Sun", "au": 0.723, "gaseous": false, "radiusKm": 6051.8, "elements": ["O", "Si", "Mg", "Fe"], "orbitKm": 108210000.0, "periodDays": 224.701, "speedKmS": 35.02, "massKg": 4.8675e+24, "gravity": 8.87},
  {"name": "Earth", "type": "Planet", "parent": "Sun", "au": 1.0, "gaseous": false, "radiusKm": 6371.0, "elements": ["Fe", "O", "Si", "Mg"], "orbitKm": 149598000.0, "periodDays": 365.256, "speedKmS": 29.78, "massKg": 5.9722e+24, "gravity": 9.82},
  {"name": "Mars", "type": "Planet", "parent": "Sun", "au": 1.524, "gaseous": false, "radiusKm": 3389.5, "elements": ["O", "Si", "Fe", "Mg"], "orbitKm": 227956000.0, "periodDays": 686.98, "speedKmS": 24.13, "massKg": 6.4171e+23, "gravity": 3.73},
  {"name": "Jupiter", "type": "Planet", "parent": "Sun", "au": 5.204, "gaseous": true, "radiusKm": 69911, "elements": ["H", "He"], "orbitKm": 778479000.0, "periodDays": 4332.589, "speedKmS": 13.07, "massKg": 1.89813e+27, "gravity": 25.9},
  {"name": "Saturn", "type": "Planet", "parent": "Sun", "au": 9.573, "gaseous": true, "radiusKm": 58232, "elements": ["H", "He"], "orbitKm": 1432041000.0, "periodDays": 10759.22, "speedKmS": 9.68, "massKg": 5.6834e+26, "gravity": 11.2},
  {"name": "Uranus", "type": "Planet", "parent": "Sun", "au": 19.165, "gaseous": true, "radiusKm": 25362, "elements": ["O", "C", "N", "H", "He"], "orbitKm": 2867043000.0, "periodDays": 30685.4, "speedKmS": 6.79, "massKg": 8.6813e+25, "gravity": 9.01},
  {"name": "Neptune", "type": "Planet", "parent": "Sun", "au": 30.181, "gaseous": true, "radiusKm": 24622, "elements": ["O", "C", "N", "H", "He"], "orbitKm": 4514953000.0, "periodDays": 60189.0, "speedKmS": 5.46, "massKg": 1.02409e+26, "gravity": 11.3},
  {"name": "Ceres", "type": "Dwarf planet", "parent": "Sun", "au": 2.765, "gaseous": false, "radiusKm": 469.7, "elements": ["O", "Si", "H", "C"], "orbitKm": 413700000.0, "periodDays": 1680.0, "speedKmS": 17.91, "massKg": 9.38e+20, "gravity": 0.284},
  {"name": "Pluto", "type": "Dwarf planet", "parent": "Sun", "au": 39.482, "gaseous": false, "radiusKm": 1188.3, "elements": ["O", "H", "N", "C", "Si"], "orbitKm": 5906400000.0, "periodDays": 90560.0, "speedKmS": 4.74, "massKg": 1.3025e+22, "gravity": 0.616},
  {"name": "Haumea", "type": "Dwarf planet", "parent": "Sun", "au": 43.116, "gaseous": false, "radiusKm": 798.0, "elements": ["O", "Si", "H"], "orbitKm": 6450000000.0, "periodDays": 103660.0, "speedKmS": 4.52, "massKg": 4.006e+21, "gravity": 0.42},
  {"name": "Makemake", "type": "Dwarf planet", "parent": "Sun", "au": 45.428, "gaseous": false, "radiusKm": 715.0, "elements": ["C", "H", "O"], "orbitKm": 6796000000.0, "periodDays": 111800.0, "speedKmS": 4.42, "massKg": 3.1e+21, "gravity": 0.405},
  {"name": "Eris", "type": "Dwarf planet", "parent": "Sun", "au": 67.862, "gaseous": false, "radiusKm": 1163.0, "elements": ["O", "Si", "C", "H", "N"], "orbitKm": 10152000000.0, "periodDays": 204200.0, "speedKmS": 3.62, "massKg": 1.6466e+22, "gravity": 0.813},
  {"name": "Moon", "type": "Moon", "parent": "Earth", "au": 1.0, "gaseous": false, "radiusKm": 1737.4, "elements": ["O", "Si", "Mg", "Fe"], "orbitKm": 384400.0, "periodDays": 27.322, "speedKmS": 1.023, "massKg": 7.346e+22, "gravity": 1.62},
  {"name": "Io", "type": "Moon", "parent": "Jupiter", "au": 5.204, "gaseous": false, "radiusKm": 1821.6, "elements": ["O", "Si", "S", "Fe"], "orbitKm": 421800.0, "periodDays": 1.762732, "speedKmS": 17.401, "massKg": 8.93e+22, "gravity": 1.8},
  {"name": "Europa", "type": "Moon", "parent": "Jupiter", "au": 5.204, "gaseous": false, "radiusKm": 1560.8, "elements": ["O", "H", "Si", "Fe"], "orbitKm": 671100.0, "periodDays": 3.525463, "speedKmS": 13.843, "massKg": 4.799e+22, "gravity": 1.31},
  {"name": "Ganymede", "type": "Moon", "parent": "Jupiter", "au": 5.204, "gaseous": false, "radiusKm": 2634.1, "elements": ["O", "H", "Si", "Fe"], "orbitKm": 1070400.0, "periodDays": 7.155588, "speedKmS": 10.878, "massKg": 1.481e+23, "gravity": 1.42},
  {"name": "Callisto", "type": "Moon", "parent": "Jupiter", "au": 5.204, "gaseous": false, "radiusKm": 2410.3, "elements": ["O", "H", "Si"], "orbitKm": 1882700.0, "periodDays": 16.69044, "speedKmS": 8.203, "massKg": 1.076e+23, "gravity": 1.24},
  {"name": "Mimas", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 198.2, "elements": ["O", "H"], "orbitKm": 186000.0, "periodDays": 0.942422, "speedKmS": 14.353, "massKg": 3.751e+19, "gravity": 0.0637},
  {"name": "Enceladus", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 252.1, "elements": ["O", "H", "Si"], "orbitKm": 238400.0, "periodDays": 1.370218, "speedKmS": 12.653, "massKg": 1.08e+20, "gravity": 0.113},
  {"name": "Tethys", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 533.1, "elements": ["O", "H"], "orbitKm": 295000.0, "periodDays": 1.887802, "speedKmS": 11.364, "massKg": 6.175e+20, "gravity": 0.145},
  {"name": "Dione", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 561.4, "elements": ["O", "H", "Si"], "orbitKm": 377700.0, "periodDays": 2.736916, "speedKmS": 10.036, "massKg": 1.095e+21, "gravity": 0.232},
  {"name": "Rhea", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 763.8, "elements": ["O", "H", "Si"], "orbitKm": 527200.0, "periodDays": 4.517503, "speedKmS": 8.487, "massKg": 2.306e+21, "gravity": 0.264},
  {"name": "Titan", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 2574.73, "elements": ["O", "H", "Si", "N", "C"], "orbitKm": 1221900.0, "periodDays": 15.945448, "speedKmS": 5.573, "massKg": 1.345e+23, "gravity": 1.35},
  {"name": "Iapetus", "type": "Moon", "parent": "Saturn", "au": 9.573, "gaseous": false, "radiusKm": 735.6, "elements": ["O", "H", "C"], "orbitKm": 3561700.0, "periodDays": 79.331002, "speedKmS": 3.265, "massKg": 1.806e+21, "gravity": 0.223},
  {"name": "Ariel", "type": "Moon", "parent": "Uranus", "au": 19.165, "gaseous": false, "radiusKm": 578.9, "elements": ["O", "H", "Si", "C"], "orbitKm": 190929.0, "periodDays": 2.520379, "speedKmS": 5.509, "massKg": 1.251e+21, "gravity": 0.249},
  {"name": "Umbriel", "type": "Moon", "parent": "Uranus", "au": 19.165, "gaseous": false, "radiusKm": 584.7, "elements": ["O", "H", "Si", "C"], "orbitKm": 265986.0, "periodDays": 4.144177, "speedKmS": 4.668, "massKg": 1.275e+21, "gravity": 0.249},
  {"name": "Titania", "type": "Moon", "parent": "Uranus", "au": 19.165, "gaseous": false, "radiusKm": 788.9, "elements": ["O", "H", "Si"], "orbitKm": 436298.0, "periodDays": 8.705869, "speedKmS": 3.644, "massKg": 3.4e+21, "gravity": 0.365},
  {"name": "Oberon", "type": "Moon", "parent": "Uranus", "au": 19.165, "gaseous": false, "radiusKm": 761.4, "elements": ["O", "H", "Si"], "orbitKm": 583511.0, "periodDays": 13.463237, "speedKmS": 3.152, "massKg": 3.076e+21, "gravity": 0.354},
  {"name": "Miranda", "type": "Moon", "parent": "Uranus", "au": 19.165, "gaseous": false, "radiusKm": 235.8, "elements": ["O", "H", "Si"], "orbitKm": 129846.0, "periodDays": 1.413479, "speedKmS": 6.68, "massKg": 6.443e+19, "gravity": 0.0773},
  {"name": "Triton", "type": "Moon", "parent": "Neptune", "au": 30.181, "gaseous": false, "radiusKm": 1353.4, "elements": ["O", "H", "N", "Si", "C"], "orbitKm": 354800.0, "periodDays": 5.8792, "speedKmS": 4.389, "massKg": 2.14e+22, "gravity": 0.78},
  {"name": "Charon", "type": "Moon", "parent": "Pluto", "au": 39.482, "gaseous": false, "radiusKm": 606, "elements": ["O", "H", "Si", "N"], "orbitKm": 19600.0, "periodDays": 6.387222, "speedKmS": 0.223, "massKg": 1.59e+21, "gravity": 0.289},
  {"name": "Dysnomia", "type": "Moon", "parent": "Eris", "au": 67.862, "gaseous": false, "radiusKm": 350, "elements": ["O", "H", "C"], "orbitKm": 37273.0, "periodDays": 15.786, "speedKmS": 0.172, "massKg": 1.796e+20, "gravity": 0.0979}
];

// ---------- helpers ----------
function mulberry32(seed) {             // small seeded random number generator
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const systemOf = (b) => (b.type === "Moon" ? b.parent : b.name);

function mergeConfig(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) ? mergeConfig(base[k] || {}, over[k]) : over[k];
  }
  return out;
}

// ---------- world scoring ----------
function resourceValue(body, byName, cfg) {
  const r = cfg.resources;
  let fuel = body.elements.includes("H") ? r.fuelIfHydrogen : 0;
  if (body.gaseous) fuel = r.fuelIfGasGiant;
  const parent = byName[body.parent];
  if (parent && parent.gaseous) fuel += r.fuelIfMoonOfGiant;
  let materials = 0;
  for (const el of body.elements) materials += r.materials[el] || 0;
  const size = clamp(Math.log10(body.radiusKm / 100), 0.3, 2);    // bigger worlds hold more
  return Math.max(0.2, (fuel + materials) * size);
}

// from: the shipyard world the expedition leaves. staged: true if the target's system already has a colony.
function difficulty(body, from, cfg, staged) {
  const w = cfg.weights, ref = cfg.reference;
  const hopAU = systemOf(body) === systemOf(from) ? cfg.sameSystemHopAU : Math.abs(body.au - from.au);
  return (
    w.distance * Math.log2(1 + hopAU) +
    w.sunProximity * Math.max(0, 1 / body.au - 1) +
    w.orbitalSpeed * Math.max(0, body.speedKmS / ref.earthSpeedKmS - 1) +
    w.gravity * Math.max(0, body.gravity / ref.earthGravity - 1) +
    (body.gaseous ? w.noSurface : 0) +
    (cfg.lore.difficulty[body.name] || 0) -
    (staged ? cfg.shipyards.stagingDiscount : 0)
  );
}

// The most people a world can hold in a given year.
function capacity(body, cfg, year) {
  const P = cfg.population, w = cfg.weights, ref = cfg.reference;
  if (body.gaseous) return P.orbitalStationCapacity;
  const tf = P.terraforming[body.name];
  if (tf && year < tf.habitableFrom) return P.outpostCapacity;
  if (!tf && cfg.lore.outposts.includes(body.name)) return P.outpostCapacity;
  const g = Math.min(1, body.gravity / P.referenceGravity);
  const sunAndSpeed = w.sunProximity * Math.max(0, 1 / body.au - 1) + w.orbitalSpeed * Math.max(0, body.speedKmS / ref.earthSpeedKmS - 1);
  return P.referenceCapacity * g ** 3 * Math.exp(-sunAndSpeed) * (P.hazard[body.name] ?? 1) * (tf ? tf.capacityMultiplier : 1);
}

// ---------- the simulation ----------
function simulate(overrides) {
  const cfg = mergeConfig(CONFIG, overrides);
  const rng = mulberry32(cfg.seed);
  const popRng = mulberry32(cfg.seed + 7919);   // separate stream, so population never changes who is colonized when
  const byName = Object.fromEntries(BODIES.map((b) => [b.name, b]));
  const value = Object.fromEntries(BODIES.map((b) => [b.name, resourceValue(b, byName, cfg)]));

  const colonies = new Map();          // name -> { body, industry, founded, busy }
  const constellations = new Map();    // name -> { established, startedAs, subspaceSince }
  const conversions = [];              // { name, year }: legacy constellations waiting to convert
  const expeditions = [];              // { from, target, arrives, difficulty }
  const pending = [];                  // { target, from, year }: constellation is up, colony being built
  const claimed = new Set();           // targets with an expedition or colony build under way
  const events = [];

  const log = (year, body, event, detail) => events.push({ year, body, event, detail: detail || "" });

  // Pre-subspace relay network. A moon's is always immediately preceded by its parent's.
  function establishConventional(name, year) {
    if (constellations.has(name)) return;
    const body = byName[name];
    if (body.type === "Moon" && !constellations.has(body.parent)) {
      constellations.set(body.parent, { established: year, startedAs: "conventional", subspaceSince: null });
      log(year, body.parent, "conventional constellation established", "relay hub for " + name);
    }
    constellations.set(name, { established: year, startedAs: "conventional", subspaceSince: null });
    log(year, name, "conventional constellation established");
  }

  // Make sure a world has a subspace constellation: build one, or convert the conventional one.
  // A moon's is always immediately preceded by its parent's.
  function establishConstellation(name, year, detail) {
    const body = byName[name];
    if (body.type === "Moon") {
      const p = constellations.get(body.parent);
      if (!p || p.subspaceSince === null) establishConstellation(body.parent, year, "relay hub for " + name);
    }
    const c = constellations.get(name);
    if (!c) {
      constellations.set(name, { established: year, startedAs: "subspace", subspaceSince: year });
      log(year, name, "subspace constellation established", detail);
    } else if (c.subspaceSince === null) {
      c.subspaceSince = year;
      log(year, name, "constellation converted to subspace", detail);
    }
  }

  function colonize(name, year, industry, detail, population) {
    const P = cfg.population;
    colonies.set(name, { body: byName[name], industry, founded: year, note: detail,
      pop: population === undefined ? P.founding : population,       // null = not modelled (Earth)
      growth: 1 + P.growthSpread * (2 * popRng() - 1), millionYear: null, snaps: {} });
    if (year !== null) log(year, name, "colonized", detail);
  }

  for (const [name, s] of Object.entries(cfg.startingColonies)) {
    establishConventional(name, s.relayYear ?? s.founded - cfg.legacyRelayLeadYears);
    colonize(name, s.founded, s.industry, s.note, s.population);
    conversions.push({ name, year: cfg.subspace.availableYear + Math.round((1 - s.industry) * cfg.subspace.legacyConversionSpanYears) });
  }
  const convertDue = (year) => {
    for (let i = 0; i < conversions.length; i++) {
      if (conversions[i].year <= year) { establishConstellation(conversions[i].name, Math.max(year, conversions[i].year)); conversions.splice(i--, 1); }
    }
  };
  convertDue(cfg.startYear);

  // ---------- telecom companies ----------
  const C = cfg.companies;
  const crng = mulberry32(cfg.seed + 104729);   // own stream: companies never change anything above
  const KIND = { backbone: "Interplanetary backbone", regional: "Regional carrier", gateway: "Local gateway", specialist: "Specialist" };
  const ALL = BODIES.map((b) => b.name);
  const regionOf = {};
  for (const [r, ws] of Object.entries(C.regions)) for (const w of ws) {
    if (!byName[w]) throw new Error("companies.regions names an unknown world: " + w);
    regionOf[w] = r;
  }
  for (const w of ALL) if (!regionOf[w]) throw new Error("companies.regions is missing " + w);
  const companies = [], byId = {}, usedNames = new Set(), rootUses = {};
  const opened = {};                  // region -> { year, by: company id }
  const gatewaysFounded = {}, nichesFounded = new Set(), regionalFounded = new Set();
  const isSettled = (w) => colonies.has(w);
  const popOf = (w) => (w === "Earth" ? Infinity : colonies.has(w) ? colonies.get(w).pop ?? 0 : 0);
  const regionPop = (r) => C.regions[r].reduce((s, w) => s + popOf(w), 0);
  const isActive = (c) => !c.acquiredBy;
  const latest = (c) => { while (c && c.acquiredBy) c = byId[c.acquiredBy]; return c; };
  const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(crng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function pickName(roots, suffixes) {
    const rs = shuffled([...new Set(roots)]).sort((a, b) => (rootUses[a] || 0) - (rootUses[b] || 0)), ss = shuffled(suffixes);
    for (const r of rs) for (const s of ss) { const n = r + " " + s; if (!usedNames.has(n)) { usedNames.add(n); rootUses[r] = (rootUses[r] || 0) + 1; return n; } }
    let i = 2; while (usedNames.has(rs[0] + " " + ss[0] + " " + i)) i++;
    const n = rs[0] + " " + ss[0] + " " + i; usedNames.add(n); return n;
  }
  function claimWorlds(cl) { return cl.region ? C.regions[cl.region] : cl.worlds === "*" ? ALL : cl.worlds; }
  function coverage(c) {
    const set = new Set();
    for (const cl of c.claims) for (const w of claimWorlds(cl)) if (isSettled(w)) set.add(w);
    if (c.kind === "backbone") {
      for (const r of Object.keys(C.regions)) if (regionPop(r) >= C.backbone.bigMarketPopulation) for (const w of C.regions[r]) if (isSettled(w)) set.add(w);
    }
    return set;
  }
  // The carrier a new local company would spin off from: the region's own carrier, else the backbone holding the region.
  function carrierFor(w) {
    const r = regionOf[w];
    const holds = (c) => isActive(c) && c.claims.some((cl) => cl.region === r);
    return companies.find((c) => c.kind === "regional" && holds(c)) || companies.find((c) => c.kind === "backbone" && holds(c)) || null;
  }
  function found(spec, year) {
    const c = { id: "c" + String(companies.length + 1).padStart(3, "0"), environment: null, parent: null, absorbed: [], acquiredBy: null, acquiredYear: null, ...spec, founded: year };
    companies.push(c); byId[c.id] = c;
    const how = c.parent ? "spun off from " + byId[c.parent].name : c.kind === "backbone" ? "pre-subspace network" : "independent startup";
    log(year, c.hq, "company founded", c.name + ", " + KIND[c.kind].toLowerCase() + ", " + how);
    return c;
  }
  const maybeParent = (w) => { const p = carrierFor(w); return p && crng() < C.spinOffChance ? p.id : null; };

  // Backbones grow out of the pre-subspace networks.
  for (const home of C.backbone.homes) {
    const s = cfg.startingColonies[home];
    const c = found({ kind: "backbone", name: pickName(C.names.backboneRoots[home], C.names.suffixes.backbone), hq: home,
      sectors: ["science", "commercial", "industrial"], focus: "Long-haul subspace transit between regions", claims: [{ region: regionOf[home] }] },
      s.relayYear ?? s.founded);
    if (!opened[regionOf[home]]) opened[regionOf[home]] = { year: c.founded, by: c.id };
  }
  const yardBackbone = (yard) => latest(companies.find((c) => c.kind === "backbone" && c.hq === yard)) || null;

  function stepCompanies(year) {
    // Regional carriers spin off from the backbone that opened the region.
    for (const r of Object.keys(C.regions)) {
      if (regionalFounded.has(r) || !opened[r]) continue;
      if (C.backbone.homes.some((h) => regionOf[h] === r)) continue;          // a backbone's home region needs no separate carrier
      if (regionPop(r) < C.regionalCarrier.population || year - opened[r].year < C.regionalCarrier.minYearsAfterHub) continue;
      const parent = latest(byId[opened[r].by]);
      const hq = C.regions[r].filter(isSettled).sort((a, b) => popOf(b) - popOf(a))[0];
      found({ kind: "regional", name: pickName(C.names.regionRoots[r], C.names.suffixes.regional), hq, parent: parent ? parent.id : null,
        sectors: ["science", "commercial", "industrial"], focus: "Regional relay network for the " + r + " region", claims: [{ region: r }] }, year);
      regionalFounded.add(r);
    }
    // Local gateways as worlds grow.
    for (const w of ALL) {
      if (!isSettled(w)) continue;
      const p = popOf(w);
      const target = w === "Earth" ? C.gateways.earth : p < C.gateways.firstAt ? 0 : Math.min(C.gateways.max, 1 + Math.floor((p - C.gateways.firstAt) / C.gateways.perExtra));
      if ((gatewaysFounded[w] || 0) >= target || crng() >= C.gateways.foundingChance) continue;
      found({ kind: "gateway", name: pickName(C.names.places[w] || [w], C.names.suffixes.gateway), hq: w, parent: maybeParent(w),
        sectors: ["commercial"], focus: "Local access and interplanetary uplink on " + w, claims: [{ worlds: [w] }] }, year);
      gatewaysFounded[w] = (gatewaysFounded[w] || 0) + 1;
    }
    // Specialists when their niche opens up.
    for (const n of C.niches) {
      if (nichesFounded.has(n.id)) continue;
      const list = n.worlds === "*" ? ALL : n.worlds, tr = n.trigger;
      const settled = (tr.of || list).filter(isSettled);
      const people = list.filter((w) => w !== "Earth").reduce((s, w) => s + popOf(w), 0);
      if (settled.length < (tr.colonized || 0) || people < (tr.population || 0) || year < (tr.minYear || 0) || !list.some(isSettled)) continue;
      const hq = list.filter(isSettled).sort((a, b) => popOf(b) - popOf(a))[0];
      found({ kind: "specialist", name: pickName([...(C.names.places[hq] || []), ...C.names.regionRoots[regionOf[hq]]], [n.label]), hq, niche: n.id,
        parent: maybeParent(hq), sectors: n.sectors, environment: n.environment || null, focus: n.focus, claims: [{ worlds: n.worlds }] }, year);
      nichesFounded.add(n.id);
    }
    // Acquisitions. The buyer takes over everything the company served.
    for (const c of companies.slice()) {
      if (!isActive(c) || year - c.founded < C.acquisitions.minAge) continue;
      const backbones = companies.filter((x) => x.kind === "backbone" && isActive(x));
      if (c.kind === "backbone" && backbones.length <= C.acquisitions.minBackbones) continue;
      const A = C.acquisitions;
      if (crng() >= (c.kind === "backbone" ? A.backboneRate : c.kind === "regional" ? A.regionalRate : A.rate)) continue;
      let buyer = null;
      const biggest = (xs) => xs.sort((a, b) => coverage(b).size - coverage(a).size || a.founded - b.founded)[0] || null;
      if (c.kind === "backbone" || c.kind === "regional") buyer = biggest(backbones.filter((x) => x !== c));
      else {
        const p = c.parent ? latest(byId[c.parent]) : null;
        buyer = p && p !== c && (p.kind === "backbone" || p.kind === "regional") ? p : carrierFor(c.hq);
      }
      if (!buyer || buyer === c) continue;
      c.acquiredBy = buyer.id; c.acquiredYear = year;
      // Carriers and gateways fold into the buyer's network; a specialist keeps trading as a division.
      if (c.kind !== "specialist") buyer.claims.push(...c.claims);
      buyer.absorbed.push(c.id);
      log(year, c.hq, "company acquired", c.name + " bought by " + buyer.name);
    }
  }

  for (let year = cfg.startYear + 1; year <= cfg.endYear; year++) {
    const reach = cfg.tech.start + cfg.tech.perYear * (year - cfg.startYear);

    // 0. Legacy constellations whose turn has come are converted to subspace.
    convertDue(year);

    // 1. Expeditions that arrive this year succeed or fail.
    for (let i = expeditions.length - 1; i >= 0; i--) {
      const ex = expeditions[i];
      if (ex.arrives > year) continue;
      expeditions.splice(i, 1);
      if (rng() >= sigmoid(reach - ex.difficulty)) { claimed.delete(ex.target); continue; }   // failed
      // Success: the relay constellation goes up first, then the colony is built.
      establishConstellation(ex.target, year);
      const r = regionOf[ex.target];
      if (!opened[r]) { const b = yardBackbone(ex.from); if (b) { opened[r] = { year, by: b.id }; b.claims.push({ region: r }); } }
      const L = cfg.colonyLag;
      const lag = clamp(Math.round(L.base - L.perReach * reach + rng() * L.jitter), L.min, L.max);
      pending.push({ target: ex.target, from: ex.from === "Mars" ? "Utopia Planitia" : ex.from + " yard", year: year + lag });
    }

    // 2. Colonies whose build time is up are founded. Existing colonies grow.
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p.year > year) continue;
      pending.splice(i, 1);
      claimed.delete(p.target);
      colonize(p.target, year, 0.1, "from " + p.from);
    }
    for (const [name, col] of colonies) {
      const cap = cfg.lore.outposts.includes(name) ? cfg.lore.outpostIndustryCap : 1;
      col.industry = Math.min(cap, col.industry + cfg.industryGrowth * col.industry * (1 - col.industry) + 0.005);
      if (col.pop === null) continue;
      const P = cfg.population, K = capacity(col.body, cfg, year);
      const rate = P.baseRate * (1 + (year - cfg.startYear) / P.rateDoublingYears) * col.growth;
      col.pop = Math.min(K, col.pop + rate * col.pop * (1 - col.pop / K));
      if (col.millionYear === null && col.pop >= P.heavilyPopulated) { col.millionYear = year; log(year, name, "population passed 1 million"); }
      if (P.snapshotYears.includes(year)) col.snaps[year] = Math.round(col.pop);
    }

    // 3. Each shipyard sends out expeditions from its free slips.
    const settledSystems = new Set([...colonies.keys()].map((n) => systemOf(byName[n])));
    for (const yardName of cfg.shipyards.worlds) {
      const yard = colonies.get(yardName);
      if (!yard) continue;
      let supply = 0;
      for (const [name, col] of colonies) if (!cfg.shipyards.worlds.includes(name)) supply += col.industry;
      const slips = Math.min(cfg.shipyards.maxSlips, cfg.shipyards.baseSlips + Math.floor(supply / cfg.shipyards.industryPerExtraSlip));
      let free = slips - expeditions.filter((e) => e.from === yardName).length;
      for (; free > 0; free--) {
        if (rng() >= cfg.launchRate * yard.industry) continue;
        const options = [];
        let total = 0;
        for (const b of BODIES) {
          if (colonies.has(b.name) || claimed.has(b.name)) continue;
          if (b.gaseous && !cfg.allowGasGiantColonies) continue;
          const d = difficulty(b, yard.body, cfg, settledSystems.has(systemOf(b)));
          const weight = value[b.name] * sigmoid(reach - d);     // worth it, and reachable
          if (weight < 0.05) continue;                            // not seriously considered yet
          options.push({ b, d, weight });
          total += weight;
        }
        if (!options.length) break;
        let pick = rng() * total, choice = options[options.length - 1];
        for (const o of options) { pick -= o.weight; if (pick <= 0) { choice = o; break; } }
        const years = clamp(Math.round(1 + 1.5 * choice.d - 0.5 * reach), 1, 10);   // faster as tech improves
        expeditions.push({ from: yardName, target: choice.b.name, arrives: year + years, difficulty: choice.d });
        claimed.add(choice.b.name);
      }
    }

    // 4. Companies are founded, spun off and acquired.
    stepCompanies(year);
  }

  const summary = BODIES.map((b) => ({
    body: b.name, type: b.type, parent: b.parent,
    colonized: colonies.has(b.name) ? colonies.get(b.name).founded : null,
    constellation: constellations.has(b.name) ? constellations.get(b.name).established : null,
    constellationStartedAs: constellations.has(b.name) ? constellations.get(b.name).startedAs : null,
    subspaceSince: constellations.has(b.name) ? constellations.get(b.name).subspaceSince : null,
    millionYear: colonies.has(b.name) ? colonies.get(b.name).millionYear : null,
    population: Object.fromEntries(cfg.population.snapshotYears.map((y) => [y, colonies.has(b.name) ? colonies.get(b.name).snaps[y] ?? null : null])),
    note: b.name in cfg.startingColonies ? cfg.startingColonies[b.name].note : (cfg.lore.outposts.includes(b.name) && colonies.has(b.name) ? "outpost only" : ""),
  }));
  events.sort((a, b) => a.year - b.year);     // stable: same-year events keep their order

  // Snapshot of the telecom market at the end of the run.
  const name = (id) => (id ? byId[id].name : null);
  const order = (ws) => [...ws].sort((a, b) => ALL.indexOf(a) - ALL.indexOf(b));
  const divisionsOf = (c) => c.absorbed.flatMap((id) => (byId[id].kind === "specialist" ? [byId[id]] : []).concat(divisionsOf(byId[id])));
  const activeCos = companies.filter(isActive);
  const telecom = {
    year: cfg.endYear,
    seed: cfg.seed,
    companies: companies.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, kindLabel: KIND[c.kind], sectors: c.sectors, environment: c.environment, focus: c.focus,
      headquarters: c.hq, region: regionOf[c.hq], founded: c.founded,
      parent: name(c.parent), parentId: c.parent,
      status: isActive(c) ? "active" : c.kind === "specialist" ? "division" : "merged",
      acquiredBy: name(c.acquiredBy), acquiredById: c.acquiredBy, acquiredYear: c.acquiredYear,
      owner: isActive(c) ? null : latest(c).name, ownerId: isActive(c) ? null : latest(c).id,
      // Worlds where this brand is offered in the final year: its own network for an active company,
      // its own service area for a division, nothing for a company merged into its buyer's network.
      serves: isActive(c) || c.kind === "specialist" ? order(coverage(c)) : [],
      divisions: isActive(c) ? divisionsOf(c).map((d) => d.name) : [],
    })),
    worlds: Object.fromEntries(BODIES.map((b) => {
      const col = colonies.get(b.name);
      const providers = [];
      for (const c of activeCos) {
        if (coverage(c).has(b.name)) providers.push({ brand: c.name, companyId: c.id, owner: c.name, kind: c.kind, division: false });
        for (const d of divisionsOf(c)) if (coverage(d).has(b.name)) providers.push({ brand: d.name, companyId: d.id, owner: c.name, kind: d.kind, division: true });
      }
      return [b.name, { region: regionOf[b.name], parent: b.parent, colonized: col ? col.founded : null,
        population: col && col.pop !== null ? Math.round(col.pop) : null, providers }];
    })),
  };
  return { events, summary, config: cfg, telecom };
}

function fmtPop(n) {
  if (n === null || n === undefined) return null;
  if (n >= 1e8) return Math.round(n / 1e7) * 10 + " million";
  if (n >= 1e6) return (n / 1e6).toPrecision(2).replace(/\.0$/, "") + " million";
  if (n >= 1e3) return Math.round(n / 1e3) + " thousand";
  return String(n);
}

// Run many seeds and report the median year for each world.
function monteCarlo(runs, overrides) {
  const acc = Object.fromEntries(BODIES.map((b) => [b.name, { col: [], con: [], mil: [], pop: [] }]));
  const lastYear = CONFIG.population.snapshotYears[CONFIG.population.snapshotYears.length - 1];
  for (let i = 0; i < runs; i++) {
    for (const s of simulate({ ...overrides, seed: 1000 + i }).summary) {
      if (s.colonized !== null) acc[s.body].col.push(s.colonized);
      if (s.subspaceSince !== null) acc[s.body].con.push(s.subspaceSince);
      if (s.millionYear !== null) acc[s.body].mil.push(s.millionYear);
      if (s.population[lastYear] !== null) acc[s.body].pop.push(s.population[lastYear]);
    }
  }
  const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  return BODIES.map((b) => ({
    body: b.name,
    medianColonized: median(acc[b.name].col), colonizedInRuns: Math.round((100 * acc[b.name].col.length) / runs) + "%",
    medianSubspaceConstellation: median(acc[b.name].con),
    medianYearPast1Million: acc[b.name].mil.length * 2 > runs ? median(acc[b.name].mil) : null, past1MillionInRuns: Math.round((100 * acc[b.name].mil.length) / runs) + "%",
    ["medianPopulation" + lastYear]: fmtPop(median(acc[b.name].pop)),
  })).sort((a, b) => (a.medianColonized ?? a.medianSubspaceConstellation ?? 9999) - (b.medianColonized ?? b.medianSubspaceConstellation ?? 9999));
}

// Company counts and providers per world at the end of the run, across many seeds.
function companyStats(runs, overrides) {
  const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const founded = [], active = [], acquired = [], perWorld = Object.fromEntries(BODIES.map((b) => [b.name, []]));
  const byKind = {};
  for (let i = 0; i < runs; i++) {
    const tc = simulate({ ...overrides, seed: 1000 + i }).telecom;
    founded.push(tc.companies.length);
    active.push(tc.companies.filter((c) => c.status !== "merged").length);
    acquired.push(tc.companies.filter((c) => c.status !== "active").length);
    for (const c of tc.companies) if (c.status !== "merged") (byKind[c.kindLabel] ||= Array(runs).fill(0))[i]++;
    for (const [w, v] of Object.entries(tc.worlds)) perWorld[w].push(v.providers.length);
  }
  return {
    medianFounded: median(founded), medianActive: median(active), medianAcquired: median(acquired),
    activeByKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, median(v)])),
    providersPerWorld: Object.fromEntries(Object.entries(perWorld).map(([w, v]) => [w, median(v)])),
  };
}

// For each canon deadline, the share of runs in which the world met it.
function loreCheck(runs, overrides) {
  const cfg = mergeConfig(CONFIG, overrides);
  const hits = Object.fromEntries(Object.keys(cfg.lore.targets).map((n) => [n, 0]));
  for (let i = 0; i < runs; i++) {
    for (const s of simulate({ ...overrides, seed: 1000 + i }).summary) {
      const tg = cfg.lore.targets[s.body];
      if (!tg) continue;
      if (tg.event === "population") { if ((s.population[tg.by] ?? 0) >= tg.atLeast) hits[s.body]++; continue; }
      const year = tg.event === "colonized" ? s.colonized : s.constellation;
      if (year !== null && year <= tg.by) hits[s.body]++;
    }
  }
  return Object.entries(cfg.lore.targets).map(([body, tg]) => ({ body, mustHave: (tg.event === "population" ? "population of " + fmtPop(tg.atLeast) : tg.event) + " by " + tg.by, source: tg.source, runsMeetingIt: Math.round((100 * hits[body]) / runs) + "%" }));
}

// ---------- dataset export for other applications ----------
// Turns one run into a single JSON-ready object with stable kebab-case IDs and raw numbers.
// Shape is described in sol-telecom-2380.d.ts.
const SOURCES = [
  { id: "ma-warp-drive", title: "Memory Alpha: Warp drive", url: "https://memory-alpha.fandom.com/wiki/Warp_drive" },
  { id: "ma-subspace", title: "Memory Alpha: Subspace communication", url: "https://memory-alpha.fandom.com/wiki/Subspace_communication" },
  { id: "ma-echo-one", title: "Memory Alpha: Echo One", url: "https://memory-alpha.fandom.com/wiki/Echo_One" },
  { id: "ma-relay-station", title: "Memory Alpha: Communication relay station", url: "https://memory-alpha.fandom.com/wiki/Communication_relay_station" },
  { id: "ma-luna", title: "Memory Alpha: Luna (mirror copy)", url: "https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Luna" },
  { id: "ma-mars", title: "Memory Alpha: Martian colonies (mirror copy)", url: "https://file-hippo.netlify.app/host-https-memory-alpha.fandom.com/wiki/Martian_colonies" },
  { id: "ma-utopia", title: "Memory Alpha: Utopia Planitia Fleet Yards", url: "https://memory-alpha.fandom.com/wiki/Utopia_Planitia_Fleet_Yards" },
  { id: "ma-jupiter-station", title: "Memory Alpha: Jupiter Station", url: "https://memory-alpha.fandom.com/wiki/Jupiter_Station" },
  { id: "ma-ganymede", title: "Memory Alpha: Ganymede", url: "https://memory-alpha.fandom.com/wiki/Ganymede" },
  { id: "ma-titan", title: "Memory Alpha: Titan", url: "https://memory-alpha.fandom.com/wiki/Titan" },
  { id: "ma-venus", title: "Memory Alpha: Venus (mirror copy)", url: "https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Venus" },
  { id: "ma-first-duty", title: "Memory Alpha: The First Duty (episode)", url: "https://memory-alpha.fandom.com/wiki/The_First_Duty_(episode)" },
  { id: "ma-saturn", title: "Memory Alpha: Saturn (mirror copy)", url: "https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Saturn" },
  { id: "ma-deuterium", title: "Memory Alpha: Deuterium (mirror copy)", url: "https://file-hippo.netlify.app/host-https-memory-alpha.fandom.com/wiki/Deuterium" },
  { id: "ma-terraform", title: "Memory Alpha: Terraform (mirror copy)", url: "https://sonicgame.netlify.app/host-https-memory-alpha.fandom.com/wiki/Terraform" },
  { id: "jpl-sat-elements", title: "JPL Planetary Satellite Mean Elements", url: "https://ssd.jpl.nasa.gov/sats/elem/sep.html" },
  { id: "jpl-sat-physical", title: "JPL Planetary Satellite Physical Parameters", url: "https://ssd.jpl.nasa.gov/sats/phys_par/sep.html" },
  { id: "jpl-planets", title: "JPL Planetary Physical Parameters", url: "https://ssd.jpl.nasa.gov/planets/phys_par.html" },
];
const CANON_NOTES = {
  Earth: [{ year: 1962, text: "Telstar 1, the first active relay satellite (real history; used as Earth's first relay)", sourceId: null }],
  Moon: [
    { year: 2069, text: "New Berlin built between 2063 and 2069 (ENT \"Terra Nova\")", sourceId: "ma-luna" },
    { year: 2090, text: "Orpheus Mining Complex built (ENT \"Demons\")", sourceId: "ma-luna" },
    { year: 2373, text: "Over 50 million inhabitants (Star Trek: First Contact)", sourceId: "ma-luna" },
  ],
  Mars: [
    { year: 2069, text: "Settlements exist, tied to Utopia Planitia (ENT \"Terra Nova\")", sourceId: "ma-mars" },
    { year: 2103, text: "Mars colonized (VOY \"The 37's\")", sourceId: "ma-mars" },
    { year: 2155, text: "Terraforming under way; lowlands need only thermal clothing and oxygen (ENT \"Demons\", \"Terra Prime\")", sourceId: "ma-terraform" },
  ],
  Jupiter: [{ year: 2151, text: "Jupiter Station services Starfleet and Earth Cargo Service ships (ENT \"Fortunate Son\")", sourceId: "ma-jupiter-station" }],
  Ganymede: [{ year: 2268, text: "Inhabited: Scott has a drink he found there (TOS \"By Any Other Name\")", sourceId: "ma-ganymede" }],
  Titan: [
    { year: 2259, text: "A mine is operating (SNW \"Memento Mori\")", sourceId: "ma-titan" },
    { year: null, text: "Human research colony, undated (DIS \"People of Earth\")", sourceId: "ma-titan" },
  ],
  Venus: [
    { year: 2340, text: "Chakotay trains in its storms in the 2340s (VOY \"Future's End, Part II\")", sourceId: "ma-venus" },
    { year: 2371, text: "Terraforming stations operating (DS9 \"Past Tense, Part I\")", sourceId: "ma-venus" },
  ],
  Mimas: [{ year: 2368, text: "Emergency evacuation station (TNG \"The First Duty\")", sourceId: "ma-first-duty" }],
  Saturn: [{ year: 2368, text: "Navigational control satellites in orbit (TNG \"The First Duty\")", sourceId: "ma-saturn" }],
};

function exportDataset(result) {
  const cfg = result.config, tc = result.telecom;
  const slug = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const worldId = (n) => slug(n === "S/2015 (136472) 1" ? "makemake-i" : n);
  const regionId = (r) => slug(r);
  const usedCo = new Set();
  const coId = {};
  for (const c of tc.companies) { let s = slug(c.name), i = 2; while (usedCo.has(s)) s = slug(c.name) + "-" + i++; usedCo.add(s); coId[c.id] = s; }
  const byName = Object.fromEntries(BODIES.map((b) => [b.name, b]));
  const sum = Object.fromEntries(result.summary.map((s) => [s.body, s]));
  const AU_KM = 149597870.7, C_KMS = 299792.458, EARTH_PERIOD = 365.256;
  const oneWayMs = (km) => +((km / (C_KMS * cfg.subspaceSpeedC)) * 1000).toFixed(4);
  const heliocentric = (b) => (b.type === "Moon" ? byName[b.parent] : b);

  const worlds = BODIES.map((b) => {
    const s = sum[b.name], w = tc.worlds[b.name], h = heliocentric(b);
    let latency;
    if (b.name === "Earth") latency = { min: 0, max: 0 };
    else if (b.type === "Moon" && b.parent === "Earth") latency = { min: oneWayMs(b.orbitKm), max: oneWayMs(b.orbitKm) };
    else latency = { min: oneWayMs(Math.abs(h.au - 1) * AU_KM), max: oneWayMs((h.au + 1) * AU_KM) };
    const synodic = h.name === "Earth" ? null : Math.round(1 / Math.abs(1 / EARTH_PERIOD - 1 / h.periodDays));
    return {
      id: worldId(b.name), name: b.name,
      type: b.type === "Moon" ? "moon" : b.type === "Planet" ? "planet" : "dwarf-planet",
      parentId: b.type === "Moon" ? worldId(b.parent) : null,
      regionId: regionId(w.region),
      physical: {
        gaseous: b.gaseous, radiusKm: b.radiusKm, massKg: b.massKg, surfaceGravityMs2: b.gravity,
        mainElements: b.elements, distanceFromSunAu: b.au,
        orbitRadiusKm: b.type === "Moon" ? b.orbitKm : null, orbitalPeriodDays: b.periodDays, orbitalSpeedKmS: b.speedKmS,
      },
      history: {
        constellationEstablished: s.constellation, constellationStartedAs: s.constellationStartedAs, subspaceSince: s.subspaceSince,
        colonized: s.colonized, homeworld: b.name === "Earth", passedOneMillion: s.millionYear,
      },
      population: b.name === "Earth" ? null : w.population,
      populationHistory: b.name === "Earth" ? null : Object.fromEntries(Object.entries(s.population).filter(([, v]) => v !== null)),
      communications: { subspaceLatencyToEarthMs: latency, solarConjunctionWithEarthEveryDays: synodic },
      canon: (CANON_NOTES[b.name] || []),
      providerIds: w.providers.map((p) => coId[p.companyId]),
    };
  });

  const companies = tc.companies.map((c) => ({
    id: coId[c.id], name: c.name, kind: c.kind, kindLabel: c.kindLabel, sectors: c.sectors, environment: c.environment, focus: c.focus,
    headquartersWorldId: worldId(c.headquarters), regionId: regionId(c.region), founded: c.founded,
    parentId: c.parentId ? coId[c.parentId] : null, origin: c.parentId ? "spin-off" : c.kind === "backbone" ? "pre-subspace network" : "startup",
    status: c.status, ownerId: c.ownerId ? coId[c.ownerId] : null, acquiredById: c.acquiredById ? coId[c.acquiredById] : null, acquiredYear: c.acquiredYear,
    servesWorldIds: c.serves.map(worldId),
    divisionIds: c.divisions.map((n) => coId[tc.companies.find((x) => x.name === n).id]),
  }));

  const nameToCo = Object.fromEntries(tc.companies.map((c) => [c.name, coId[c.id]]));
  const TYPE = { "colonized": "colonized", "conventional constellation established": "conventional-constellation",
    "subspace constellation established": "subspace-constellation", "constellation converted to subspace": "constellation-converted",
    "population passed 1 million": "population-one-million", "company founded": "company-founded", "company acquired": "company-acquired" };
  const events = result.events.map((e) => {
    const ev = { year: e.year, type: TYPE[e.event] || slug(e.event), worldId: worldId(e.body), detail: e.detail || null };
    if (e.event === "company founded") ev.companyId = nameToCo[e.detail.split(", ")[0]];
    if (e.event === "company acquired") { const [a, b] = e.detail.split(" bought by "); ev.companyId = nameToCo[a]; ev.buyerId = nameToCo[b]; }
    return ev;
  });

  return {
    schemaVersion: "1.0.0",
    meta: {
      title: "Sol system telecommunications, " + cfg.endYear,
      description: "Settled worlds, population and interplanetary telecom providers in the Sol system in " + cfg.endYear + ", generated by an agent-based simulation set in the Star Trek universe. Fan work; not official.",
      seed: cfg.seed, year: cfg.endYear, simulationStart: cfg.startYear, subspaceSpeedC: cfg.subspaceSpeedC,
      units: { distance: "km unless the field says Au", mass: "kg", gravity: "m/s^2", period: "days", speed: "km/s", latency: "milliseconds, one way" },
      sources: SOURCES,
    },
    regions: Object.entries(cfg.companies.regions).map(([r, ws]) => ({ id: regionId(r), name: r, worldIds: ws.map(worldId) })),
    sectors: [
      { id: "science", name: "Scientific" }, { id: "commercial", name: "Commercial" }, { id: "industrial", name: "Industrial" }],
    companyKinds: [
      { id: "backbone", name: "Interplanetary backbone", description: "Long-haul subspace transit between regions; grew out of a pre-subspace network." },
      { id: "regional", name: "Regional carrier", description: "Relay network for one region; spun off from the backbone that opened it." },
      { id: "gateway", name: "Local gateway", description: "Local access and interplanetary uplink on one world." },
      { id: "specialist", name: "Specialist", description: "A network for one industry, science field or harsh environment." }],
    worlds, companies, events,
  };
}

const ColonizationSim = { CONFIG, BODIES, simulate, monteCarlo, loreCheck, companyStats, exportDataset, difficulty, resourceValue, capacity, fmtPop };
if (typeof window !== "undefined") window.ColonizationSim = ColonizationSim;
if (typeof module !== "undefined" && module.exports) module.exports = ColonizationSim;

// ---------- command line ----------
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const seed = Number(process.argv[2] ?? CONFIG.seed);
  const runs = Number(process.argv[3] ?? 0);
  const result = simulate({ seed });

  console.log("Timeline (seed " + seed + ")");
  for (const e of result.events) console.log(e.year + "  " + e.body.padEnd(10) + " " + e.event + (e.detail ? "  (" + e.detail + ")" : ""));

  const order = (a, b) => (a.colonized ?? a.constellation ?? 9999) - (b.colonized ?? b.constellation ?? 9999);
  console.log("\nBy world");
  console.table(result.summary.slice().sort(order).map((s) => ({ body: s.body, parent: s.parent, constellation: s.constellation, startedAs: s.constellationStartedAs, subspaceSince: s.subspaceSince, colonized: s.colonized, past1Million: s.millionYear })));

  console.log("\nEstimated population");
  console.table(result.summary.slice().sort(order).filter((s) => s.body !== "Earth").map((s) => ({ body: s.body, ...Object.fromEntries(Object.entries(s.population).map(([y, n]) => [y, fmtPop(n)])) })));

  const years = result.config.population.snapshotYears;
  const popCsv = ["body,colonized,past_1_million," + years.map((y) => "population_" + y).join(",")].concat(
    result.summary.map((s) => [s.body, s.colonized ?? "", s.millionYear ?? "", ...years.map((y) => s.population[y] ?? "")].join(","))).join("\n");
  require("fs").writeFileSync("colonization-population.csv", popCsv + "\n");

  // Telecom market at the end of the run.
  const tc = result.telecom;
  const byIdOut = Object.fromEntries(tc.companies.map((c) => [c.id, c]));
  const nStatus = (s) => tc.companies.filter((c) => c.status === s).length;
  console.log("\nTelecom companies in " + tc.year + " (" + nStatus("active") + " independent, " + nStatus("division") + " trading as divisions, " + nStatus("merged") + " merged into their buyers)");
  console.table(tc.companies.filter((c) => c.status !== "merged").map((c) => ({ name: c.name, kind: c.kindLabel, hq: c.headquarters, founded: c.founded, parent: c.parent ?? "", owner: c.owner ?? "", worlds: c.serves.length })));
  console.log("\nProviders by world in " + tc.year);
  for (const [w, v] of Object.entries(tc.worlds)) {
    if (!v.providers.length) continue;
    console.log(w.padEnd(10) + String(v.providers.length).padStart(3) + "  " + v.providers.map((p) => p.division ? p.brand + " [" + p.owner + "]" : p.brand).join(", "));
  }
  require("fs").writeFileSync("telecom-" + tc.year + ".json", JSON.stringify(tc, null, 2) + "\n");
  require("fs").writeFileSync("sol-telecom-" + tc.year + ".json", JSON.stringify(exportDataset(result), null, 2) + "\n");
  console.log("Wrote sol-telecom-" + tc.year + ".json (dataset for other applications)");
  const q = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const provCsv = ["world,region,population,brand,owner,division,kind,sectors,environment,headquarters,founded,parent"].concat(
    Object.entries(tc.worlds).flatMap(([w, v]) => v.providers.map((p) => { const c = byIdOut[p.companyId];
      return [q(w), q(v.region), v.population ?? "", q(p.brand), q(p.owner), p.division ? "yes" : "no", q(c.kindLabel), q(c.sectors.join(" ")), q(c.environment), q(c.headquarters), c.founded, q(c.parent)].join(","); }))).join("\n");
  require("fs").writeFileSync("telecom-" + tc.year + "-providers.csv", provCsv + "\n");
  console.log("Wrote telecom-" + tc.year + ".json and telecom-" + tc.year + "-providers.csv");

  const csv = ["year,body,event,detail"].concat(result.events.map((e) => [e.year, e.body, e.event, '"' + e.detail + '"'].join(","))).join("\n");
  require("fs").writeFileSync("colonization-timeline.csv", csv + "\n");
  console.log("Wrote colonization-timeline.csv and colonization-population.csv");

  if (runs > 0) {
    console.log("\nMedian years across " + runs + " runs");
    console.table(monteCarlo(runs));
    console.log("\nCompanies across " + runs + " runs");
    const cs = companyStats(runs);
    console.log("Median founded " + cs.medianFounded + ", brands still trading in " + CONFIG.endYear + " " + cs.medianActive + ", bought at some point " + cs.medianAcquired);
    console.table(cs.activeByKind);
    console.log("\nCanon deadlines");
    console.table(loreCheck(runs));
  }
}

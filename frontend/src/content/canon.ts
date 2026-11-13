/**
 * Canon page copy. Unlike the About page it is written out-of-universe: it separates what is
 * on screen in Star Trek from what this project invented, and explains the simulation. Facts and
 * figures come from the API; only the explanation lives here.
 */
import type { LabelKind } from '../features/canon/CanonLabel';

export interface Claim {
  kind: LabelKind;
  text: string;
}

export const INTRO = {
  lead: 'Planet2Planet’s setting is built from three things, and this page says which is which.',
  parts: [
    {
      kind: 'real',
      text: 'Real astronomy gives the worlds: 33 planets, dwarf planets and moons with their real sizes and orbits.',
    },
    {
      kind: 'on-screen',
      text: 'On-screen Star Trek facts are the fixed points: dates and events that were shown or stated in an episode or film.',
    },
    {
      kind: 'invented',
      text: 'An agent-based simulation fills in the centuries canon leaves open: when each world was settled, how many people live there, and which companies sell service.',
    },
  ] as Claim[],
  snapshot:
    'The snapshot year is 2380 (stardate 57436.2, the date of Lower Decks’ first episode). It was chosen to give a mature market with as few complications from canon as possible:',
  snapshotReasons: [
    {
      kind: 'invented',
      text: 'The market is mature. It fills in by about 2350: every world is settled, ten have passed a million people, and nearly all have five or more providers.',
    },
    {
      kind: 'on-screen',
      text: 'It is close to the settled, everyday Federation of Lower Decks, set in 2380 and 2381.',
    },
    {
      kind: 'on-screen',
      text: 'It follows the Dominion War, which brought two attacks to Sol: the Borg at Earth in 2373 (Star Trek: First Contact) and the Breen strike on Earth in 2375 (DS9 "The Changing Face of Evil"). Neither left lasting damage.',
    },
    {
      kind: 'on-screen',
      text: 'It comes before the later upheavals: the attack on Mars in 2385, the ban on synthetics that followed it, the Romulan supernova in 2387 and Frontier Day in 2401. Any of these would undercut the premise of Mars as the system’s shipyard, so this site shows nothing from after 2380.',
    },
  ] as Claim[],
};

export const WORLDS = {
  paragraphs: [
    'The 33 worlds are every body in the Solar System that could host a colony with its own ring of relay satellites, filtered from 477 known planets, dwarf planets and moons. A body qualifies if both of these hold:',
  ],
  rules: [
    'It is a real world. Its surface gravity is at least 0.06 m/s², the level of Saturn’s moon Mimas, the smallest body known to have pulled itself round. Anything smaller is a rubble pile or a captured fragment.',
    'Satellites can orbit it. A satellite stays bound only within about half a body’s Hill radius, where its gravity beats its parent’s. For moons close to a giant planet, that zone can sit below ground.',
  ],
  which:
    'The 33 are the 8 planets, 5 dwarf planets (Ceres, Pluto, Haumea, Makemake, Eris) and 20 moons: the Moon; Io, Europa, Ganymede and Callisto; Mimas, Enceladus, Tethys, Dione, Rhea, Titan and Iapetus; Miranda, Ariel, Umbriel, Titania and Oberon; Triton; Charon; and Dysnomia.',
  sources:
    'Sizes and orbits come from NASA’s Jet Propulsion Laboratory. The positions on the maps come from JPL’s approximate orbital elements, solved in your browser.',
  links: [
    { label: 'JPL Planetary Physical Parameters', url: 'https://ssd.jpl.nasa.gov/planets/phys_par.html' },
    { label: 'JPL Planetary Satellite Mean Elements', url: 'https://ssd.jpl.nasa.gov/sats/elem/sep.html' },
    { label: 'JPL Planetary Satellite Physical Parameters', url: 'https://ssd.jpl.nasa.gov/sats/phys_par/sep.html' },
  ],
};

export const CANON_FIXES = {
  intro:
    'Only events shown or stated on screen count as canon here. Reference books and licensed novels were set aside. Every fact below links to its Memory Alpha article. Memory Alpha blocks automated tools, and some of its pages were read from mirror copies, which can lag the live wiki.',
  starting: 'Starting conditions are built into the simulation as fact.',
  deadlines:
    'For these worlds canon gives no founding date, only a year by which people are already there. The simulation is not steered toward them. Each is checked across all the runs described below.',
  setAside: 'These claims were left out, and the reason is given for each.',
};

export const SIMULATION = {
  intro:
    'The simulation runs year by year from 2151 to 2380. It is Node code with no dependencies, and it is itself invented: canon supplies its starting conditions, and everything else is a modelling choice.',
  agents: [
    [
      'Shipyard',
      'Utopia Planitia at Mars, the only place expeditions are built. It starts with two construction slips and gains one for every three units of industry across the colonies, up to eight.',
    ],
    [
      'Expedition',
      'Built at the shipyard and sent to one world. It takes some years to set up, then succeeds or fails on a roll that gets easier as technology improves.',
    ],
    [
      'Colony',
      'One per settled world. Grows its industry and population every year. Colonies do not launch expeditions; their mining output feeds the shipyard.',
    ],
    [
      'Company',
      'An interplanetary telecom company: a backbone carrier, a regional carrier, a local gateway or a specialist.',
    ],
  ] as [string, string][],
  steps: [
    'Pre-subspace constellations whose turn has come are converted to subspace.',
    'Expeditions that arrive roll for success.',
    'A successful expedition first puts up a subspace constellation. If the target is a moon, its parent planet gets one immediately beforehand as the hub.',
    'The colony is founded a few years later. The gap shrinks from about 6 to 9 years in the 2150s to 1 to 3 years by the late 2200s.',
    'The shipyard fills its free slips with new expeditions.',
    'Each colony’s population grows.',
    'Companies are founded, spun off and bought.',
  ],
  targets: [
    'Value, the reason to go: colonies exist to mine fuel for warp drives and materials for ships and stations. Hydrogen-bearing worlds count as fuel sources; iron, silicon, magnesium and carbon count as building stock; bigger worlds hold more. Moons of the giant planets get a bonus as bases for skimming the planet’s atmosphere.',
    'Difficulty, the reason to wait: penalties for orbiting faster than Earth, gravity above Earth’s, being closer to the Sun than Earth, having no solid surface, and distance from Mars. A world in a system that already has a colony gets a small discount, as a staging point.',
  ],
  targetsNote:
    'The "reach" score starts at 1.5 in 2151 and rises by 0.06 a year. The odds of an expedition succeeding depend on reach minus difficulty, so hard worlds come later. The four giant planets end up with orbital stations, never surface colonies.',
  rules: [
    'No world is colonized before it has a constellation.',
    'No moon gets a constellation before its parent planet.',
  ],
  rulesNote: 'Neither rule was broken in any run.',
  runIt:
    'node tools/colonization-sim.js 1701 400            # one run, then medians across 400 runs\nnode tools/colonization-sim.js 1701 400 --export   # write the two JSON files this site loads',
};

export const MONTE_CARLO = {
  random: [
    'whether an expedition succeeds',
    'which world the shipyard picks',
    'how long a colony takes to build',
    'small differences in each colony’s growth',
    'when companies are founded, spun off or bought',
  ],
  eachRun:
    'Every run draws from a seeded random generator, so each seed is one complete, repeatable history. Run the same seed twice and you get the same file, byte for byte.',
  checked:
    'The canon deadlines are tested as the share of runs that met them, and the two rules are checked in every run.',
  streams:
    'Population and companies each draw from their own random stream, so adding them changed nothing about colonization.',
  oneRun:
    'The shop uses a single run, not medians, because it needs one consistent world in which every provider list, company history and population agrees. A "median world" is not a history that could happen. The shop’s world is seed 1701, and the strip plot below shows where it sits within the spread.',
};

export const INVENTED = [
  [
    'The tuning',
    'The difficulty weights, the pace of technology, the shipyard’s slips, industry growth and launch rates produce a plausible order of settlement, not a prediction.',
  ],
  [
    'Two founding years',
    'The Moon’s 2069 and Jupiter Station’s 2151 are the latest years canon allows; either could be earlier.',
  ],
  [
    'Pre-subspace relays',
    'Canon dates none. Their years and the conversion schedule are inferred. Earth’s is set at 1962, the year of Telstar 1, the first real active relay satellite.',
  ],
  ['Venus and Mimas as outposts', 'Canon describes stations there; capping their growth is a reading of that.'],
  [
    'A single shipyard',
    'Routing every expedition through Utopia Planitia is the simulation’s premise. Canon also shows ships built elsewhere, such as in Earth orbit.',
  ],
  [
    'Population',
    'Everything except the Moon’s 50 million: the growth curve, each world’s capacity, and Mars at three times the Moon.',
  ],
  ['The companies', 'Their kinds, niches, founding rules, buyouts and names.'],
  ['Pricing and plans', 'Every plan, price, resilience tier and the credit economy are Planet2Planet’s own.'],
  [
    'The solar conjunction rule',
    'Canon does not say whether the Sun or a planet in the way affects subspace. That the Sun degrades it within 0.1 AU and planets do not is this project’s own design.',
  ],
] as [string, string][];

export const SOURCES = {
  astronomy: [
    { label: 'JPL Planetary Satellite Mean Elements', url: 'https://ssd.jpl.nasa.gov/sats/elem/sep.html' },
    { label: 'JPL Planetary Satellite Physical Parameters', url: 'https://ssd.jpl.nasa.gov/sats/phys_par/sep.html' },
    { label: 'JPL Planetary Physical Parameters', url: 'https://ssd.jpl.nasa.gov/planets/phys_par.html' },
    {
      label: 'JPL: Keplerian elements for approximate positions of the major planets',
      url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    },
    {
      label: 'NASA: What’s up, solar conjunction',
      url: 'https://science.nasa.gov/resource/whats-up-solar-conjunction',
    },
  ],
  stardate: {
    label: 'Ex Astris Scientia: Lower Decks season 1, for stardate 57436.2',
    url: 'https://www.ex-astris-scientia.org/episodes/low1.htm',
  },
  disclaimer:
    'Planet2Planet is unofficial fan work. Star Trek and related marks belong to their owners. This site uses no Star Trek logos, insignia, images or interface designs.',
};

export const WATCH = {
  intro:
    'This is the history the shop uses, the run with seed 1701. Drag the year or press Play and watch the system fill in. Nothing plays until you ask it to.',
  legend: [
    ['Dashed ring', 'a conventional constellation: light-speed relays, built before subspace'],
    ['Solid ring', 'a subspace constellation'],
    ['Filled world', 'a colony has been founded'],
    ['Faint world', 'nothing there yet'],
  ] as [string, string][],
};

/**
 * About page copy. It is written in-universe, as Planet2Planet's own page, so it states the
 * fiction plainly. Canon facts cite their episode; the Canon page separates what is on screen
 * from what was invented.
 */

export const OVERVIEW = {
  problem: (worlds: number, brands: number) => ({
    heading: `Keeping a business connected across ${worlds} worlds`,
    paragraphs: [
      `Picture an entrepreneur with a mining operation on Callisto, buyers on the Moon and a broker on Mars. To connect them they face ${brands} trading brands, four kinds of carrier, regional monopolies at the edges of the system, and plan terms that hide how many companies touch their traffic.`,
      'The stakes are real. A link that stalls during a solar conjunction, or fails in a crisis, stops the business.',
    ],
  }),
  solution: {
    heading: 'What Planet2Planet does',
    paragraphs: [
      'Planet2Planet compares every plan between any two worlds. It shows the real route and who carries each leg, prices every plan the same way, and flags which plans keep working when the system is under strain.',
      'Planet2Planet was founded in 2378 in Tycho City on the Moon by two former relay-station engineers, who were tired of reading carrier contracts to find out who actually owned the cable.',
      'Prices are in Federation credits. Credits are the settlement unit for commercial services traded between worlds and with partners outside the Federation.',
    ],
  },
};

export const HISTORY_INTRO =
  'Sol’s networks began with a light-speed relay satellite over Earth. Subspace arrived in the 2150s and converted the four older networks within five years. The timeline below comes straight from the dataset behind this site.';

export const NETWORK_INTRO =
  'Every link in the system in 2380. Pick a provider to light its coverage and dim the rest, or filter by layer, kind of provider and region.';

export const SUBSPACE = {
  speed: {
    heading: 'How fast subspace is',
    paragraphs: [
      'Subspace radio travels at about 52,000 times the speed of light (Spock, SNW "All Those Who Wander"). Data’s figure in TNG "Where No One Has Gone Before" works out to about 52,090.',
      'Across Sol that is fast, but not instant. These worked examples use the delays in the dataset, with the time light-speed radio would need for comparison.',
    ],
  },
  history: {
    heading: 'From amplifiers to relay networks',
    bullets: [
      'Early subspace needed amplifiers to reach distant ships (ENT "Fortunate Son", "Silent Enemy"). Enterprise deployed Echo One in 2151.',
      'By the 24th century, relay stations maintain subspace relay networks (TNG "Aquiel").',
      'Signals weaken over distance unless relays boost them (VOY "Message in a Bottle"), which is why routes have hops.',
    ],
  },
  compare: {
    heading: 'Line of sight, compared with older technology',
    columns: ['', 'Radio (before 2151)', 'Optical or laser (before 2151)', 'Subspace (Planet2Planet’s network)'],
    rows: [
      ['Speed', 'Light speed', 'Light speed', 'About 52,000 times light speed'],
      ['Needs a clear line of sight', 'Yes', 'Yes, and precise pointing', 'No'],
      ['A planet or moon in the way', 'Blocks it', 'Blocks it', 'No effect'],
      [
        'Passing close to the Sun',
        'Garbled by the solar corona for about two weeks around conjunction',
        'Blinded by the Sun’s glare',
        'Degraded near the Sun; rerouted on plans that include it',
      ],
      ['Space weather (ion storms, flares)', 'Disrupts', 'Less affected', 'Disrupts; hardened relays resist'],
    ] as string[][],
    note: 'The radio and optical columns describe real technology that NASA uses today. Canon does not say whether a planet in the way, or the Sun, affects subspace. That the Sun degrades subspace while planets do not is Planet2Planet’s own engineering assumption, and it is how every plan here is priced.',
  },
};

export interface Tier {
  id: string;
  name: string;
  adds: string;
  why: string;
}

export const TIERS_INTRO =
  'Reliability in ordinary conditions is assumed. These tiers are for extraordinary days. Each is a plan feature or an add-on, and each answers an event that has happened to Sol.';

export const TIERS: Tier[] = [
  {
    id: 'standard',
    name: 'Standard',
    adds: 'A single route and the carrier’s normal repair commitments.',
    why: 'For links where an outage is an inconvenience, not an emergency.',
  },
  {
    id: 'diverse-path',
    name: 'Diverse path',
    adds: 'Two routes over different backbones that share no relay hub except the two endpoints, with automatic failover.',
    why: 'A Borg cube came within reach of Earth in 2367, after Wolf 359, and was stopped in Earth orbit (TNG "The Best of Both Worlds, Part II"). The Borg attacked Earth again in 2373 (Star Trek: First Contact).',
  },
  {
    id: 'hardened',
    name: 'Hardened',
    adds: 'Shielded, environment-hardened relays and power, with independent power at the endpoints.',
    why: 'Earth’s planetary power relay system went down, and the Dominion was blamed (DS9 "Homefront", "Paradise Lost"). The cause turned out to be Admiral Leyton’s Red Squad, but the lesson held: a network that depends on one grid fails with it.',
  },
  {
    id: 'contingency',
    name: 'Contingency',
    adds: 'Diverse path, plus store-and-forward buffering so no message is lost during an outage, plus a priority lane on the system-wide emergency network.',
    why: 'The Breen attacked Earth in 2375 during the Dominion War (DS9 "The Changing Face of Evil").',
  },
  {
    id: 'terraforming-zone',
    name: 'Terraforming-zone protection',
    adds: 'Routing that avoids relays near active terraforming operations on Mars and Venus, with compensation for disruption.',
    why: 'Terraforming is under way on Mars by 2155 (ENT "Demons", "Terra Prime") and there are terraforming stations at Venus by 2371 (DS9 "Past Tense, Part I"). The accident risk near them is Planet2Planet’s own assessment.',
  },
];

export const SOURCES_INTRO =
  'Planet2Planet is unofficial fan work set in the Star Trek universe. It is not affiliated with or endorsed by Paramount or any Star Trek rights holder, and it uses no Star Trek logos, insignia, images or interface designs. Plans, prices, company names and the conjunction rule are invented.';

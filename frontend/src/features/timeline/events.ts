import type { Company, HistoryEvent, World } from '../../api/types';

export type GroupId = 'worlds' | 'constellations' | 'subspace' | 'companies';

/** The four filters the timeline offers, and the event types each one covers. */
export const FILTER_GROUPS: Record<GroupId, { label: string; types: readonly string[] }> = {
  worlds: { label: 'Worlds reached', types: ['colonized', 'population-one-million'] },
  constellations: { label: 'Constellations', types: ['conventional-constellation', 'subspace-constellation'] },
  subspace: { label: 'Change to subspace', types: ['constellation-converted'] },
  companies: { label: 'Companies', types: ['company-founded', 'company-acquired'] },
};

/** How each kind of event looks: a glyph, a label in words, and a tone the stylesheet colours. */
export const EVENT_TYPES: Record<string, { label: string; glyph: string; tone: string }> = {
  'conventional-constellation': { label: 'Relay constellation', glyph: '◌', tone: 'constellation' },
  'subspace-constellation': { label: 'Subspace constellation', glyph: '◉', tone: 'constellation' },
  'constellation-converted': { label: 'Converted to subspace', glyph: '⇄', tone: 'convert' },
  colonized: { label: 'Colony', glyph: '⚑', tone: 'colony' },
  'population-one-million': { label: 'One million people', glyph: '●', tone: 'million' },
  'company-founded': { label: 'Company founded', glyph: '▣', tone: 'founded' },
  'company-acquired': { label: 'Acquisition', glyph: '⇢', tone: 'acquired' },
  canon: { label: 'Canon', glyph: '★', tone: 'canon' },
};

export interface Era {
  id: string;
  label: string;
  from: number;
  to: number;
  blurb: string;
}

/** The boundaries are this project's own, chosen to match the data. */
export const ERAS: readonly Era[] = [
  { id: 'pre-subspace', label: 'Before subspace', from: 1900, to: 2150, blurb: 'Light-speed relays' },
  {
    id: 'early-subspace',
    label: 'Early subspace',
    from: 2151,
    to: 2199,
    blurb: 'The conversion, then the first outer worlds',
  },
  {
    id: 'expansion',
    label: 'Expansion',
    from: 2200,
    to: 2299,
    blurb: 'Every region is reached and spin-offs multiply',
  },
  {
    id: 'mature-market',
    label: 'Mature market',
    from: 2300,
    to: 2399,
    blurb: 'Consolidation and the edge of the system',
  },
];

export const eraOf = (year: number): Era => ERAS.find((era) => year >= era.from && year <= era.to) ?? ERAS[0];

/** Canon context that is not part of the simulated data, always shown. */
export const CANON_MARKERS = [
  {
    year: 2063,
    title: 'First warp flight',
    detail: 'Zefram Cochrane flies the Phoenix (Star Trek: First Contact).',
  },
  {
    year: 2151,
    title: 'Subspace relays arrive',
    detail: 'Enterprise deploys Echo One, the first subspace relay (ENT "Fortunate Son", "Silent Enemy").',
  },
] as const;

export interface TimelineItem {
  key: string;
  year: number;
  type: string;
  title: string;
  detail: string | null;
  milestone: boolean;
  canon: boolean;
}

export interface YearGroup {
  year: number;
  items: TimelineItem[];
}

export interface EraGroup {
  era: Era;
  years: YearGroup[];
}

const COLONIES_OF_NOTE = new Set(['moon', 'mars']);

/**
 * Which events are headline milestones: the first relay constellation, each new region reached,
 * each conversion to subspace, the Moon and Mars being colonized, each regional carrier's spin-off
 * and each world's first million people. Keys are event indexes as strings.
 */
export function milestoneKeys(
  events: readonly HistoryEvent[],
  worlds: readonly World[],
  companies: readonly Company[],
): ReadonlySet<string> {
  const regionOf = new Map(worlds.map((w) => [w.id, w.region]));
  const kindOf = new Map(companies.map((c) => [c.id, c.kind]));
  const keys = new Set<string>();
  const regionsReached = new Set<string>();
  let firstRelay = false;
  events.forEach((event, index) => {
    const key = `${index}`;
    if (event.type === 'conventional-constellation' || event.type === 'subspace-constellation') {
      const region = regionOf.get(event.world);
      if (event.type === 'conventional-constellation' && !firstRelay) {
        firstRelay = true;
        keys.add(key);
      }
      if (region && !regionsReached.has(region)) {
        regionsReached.add(region);
        keys.add(key);
      }
    } else if (event.type === 'constellation-converted' || event.type === 'population-one-million') {
      keys.add(key);
    } else if (event.type === 'colonized' && COLONIES_OF_NOTE.has(event.world)) {
      keys.add(key);
    } else if (event.type === 'company-founded' && event.company && kindOf.get(event.company) === 'regional') {
      keys.add(key);
    }
  });
  return keys;
}

interface Names {
  world: (id: string) => string;
  company: (id: string) => string;
}

export function describeEvent(event: HistoryEvent, names: Names): { title: string; detail: string | null } {
  const world = names.world(event.world);
  const detail = event.detail && event.type !== 'company-founded' ? event.detail : null;
  switch (event.type) {
    case 'conventional-constellation':
      return { title: `${world}: first relay constellation, at light speed`, detail };
    case 'subspace-constellation':
      return { title: `${world}: subspace constellation`, detail };
    case 'constellation-converted':
      return { title: `${world}: network converted to subspace`, detail };
    case 'colonized':
      return { title: `${world} colonized`, detail };
    case 'population-one-million':
      return { title: `${world} passes one million people`, detail };
    case 'company-founded':
      return { title: `${event.company ? names.company(event.company) : 'A company'} founded`, detail: event.detail };
    case 'company-acquired':
      return {
        title: `${event.buyer ? names.company(event.buyer) : 'A company'} acquires ${event.company ? names.company(event.company) : 'a rival'}`,
        detail,
      };
    default:
      return { title: event.type, detail };
  }
}

interface Options {
  groups: ReadonlySet<GroupId>;
  milestonesOnly: boolean;
}

/** Events grouped into eras and years, after filtering. Canon markers are always included. */
export function buildTimeline(
  events: readonly HistoryEvent[],
  options: Options,
  milestones: ReadonlySet<string>,
  names: Names = { world: (id) => id, company: (id) => id },
): EraGroup[] {
  const allowed = new Set(
    Object.entries(FILTER_GROUPS).flatMap(([id, g]) => (options.groups.has(id as GroupId) ? g.types : [])),
  );
  const items: TimelineItem[] = [];
  events.forEach((event, index) => {
    const milestone = milestones.has(`${index}`);
    if (!allowed.has(event.type) || (options.milestonesOnly && !milestone)) return;
    const { title, detail } = describeEvent(event, names);
    items.push({ key: `e${index}`, year: event.year, type: event.type, title, detail, milestone, canon: false });
  });
  CANON_MARKERS.forEach((marker, index) =>
    items.push({
      key: `c${index}`,
      year: marker.year,
      type: 'canon',
      title: marker.title,
      detail: marker.detail,
      milestone: true,
      canon: true,
    }),
  );
  items.sort((a, b) => a.year - b.year || Number(a.canon) - Number(b.canon));

  const out: EraGroup[] = [];
  for (const item of items) {
    const era = eraOf(item.year);
    let group = out[out.length - 1];
    if (!group || group.era.id !== era.id) {
      group = { era, years: [] };
      out.push(group);
    }
    const last = group.years[group.years.length - 1];
    if (last && last.year === item.year) last.items.push(item);
    else group.years.push({ year: item.year, items: [item] });
  }
  return out;
}

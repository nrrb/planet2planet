/** Turns API data into what the map scene draws. No business rules: it only reshapes. */
import type { Company, Network, NetworkLink, NetworkNode, Offer, World } from '../api/types';
import { LAYER_STYLES } from './palette';
import type { Orbits } from './kepler';
import type { MapBody } from './layout';

export interface MapModel {
  bodies: MapBody[];
  orbits: Orbits;
  nodes: ReadonlyMap<string, NetworkNode>;
  links: readonly NetworkLink[];
  linkById: ReadonlyMap<string, NetworkLink>;
}

export function buildMapModel(worlds: World[], network: Network): MapModel {
  return {
    bodies: worlds.map((w) => ({ id: w.id, name: w.name, parent: w.parent, radiusKm: w.radiusKm, type: w.type })),
    orbits: network.orbits,
    nodes: new Map(network.nodes.map((n) => [n.id, n])),
    links: network.links,
    linkById: new Map(network.links.map((l) => [l.id, l])),
  };
}

export type Emphasis = 'route' | 'context' | 'dim';

export interface LinkInfo {
  carrier: string;
  layer: string;
  lengthKm: number | null;
  /** Share of the route's one-way latency, 0 to 1, when the link is part of a route. */
  latencyShare: number | null;
}

export interface RenderLink {
  id: string;
  /** Node ids, ordered in the direction traffic flows. */
  from: string;
  to: string;
  layer: string;
  emphasis: Emphasis;
  info: LinkInfo;
}

export const layerLabel = (layer: string): string => LAYER_STYLES[layer]?.label ?? layer;

const name = (companies: ReadonlyMap<string, Company>, id: string) => companies.get(id)?.name ?? id;

/**
 * The links of one offer. Route links point the way traffic flows (from the first world to
 * the second). Faint context links are the long-haul links of the offer's carriers.
 */
export function routeRenderLinks(model: MapModel, offer: Offer, companies: ReadonlyMap<string, Company>): RenderLink[] {
  const total = offer.segments.reduce((sum, s) => sum + s.latencyMs, 0) || 1;
  const out: RenderLink[] = [];
  const onRoute = new Set<string>();
  for (const segment of offer.segments) {
    segment.linkIds.forEach((linkId, index) => {
      const link = model.linkById.get(linkId);
      if (!link) return;
      const from = segment.nodeIds[index];
      const to = segment.nodeIds[index + 1];
      onRoute.add(linkId);
      out.push({
        id: linkId,
        from,
        to,
        layer: link.layer,
        emphasis: 'route',
        info: {
          carrier: name(companies, segment.companyId),
          layer: layerLabel(link.layer),
          lengthKm: segment.lengthKm,
          latencyShare: segment.latencyMs / total,
        },
      });
    });
  }
  const carriers = new Set([offer.leadCompanyId, ...offer.partnerIds]);
  for (const link of model.links) {
    if (onRoute.has(link.id) || !carriers.has(link.operator)) continue;
    const longHaul = link.layer === 'backbone' || link.layer === 'cross';
    if (!longHaul && !(link.layer === 'conjunction' && offer.conjunction === 'rerouted')) continue;
    out.push({
      id: link.id,
      from: link.a,
      to: link.b,
      layer: link.layer,
      emphasis: 'context',
      info: {
        carrier: name(companies, link.operator),
        layer: layerLabel(link.layer),
        lengthKm: null,
        latencyShare: null,
      },
    });
  }
  return out;
}

export interface NetworkFilters {
  layers: readonly string[];
  kinds: readonly string[];
  providers: readonly string[];
  region: string | null;
}

export const EMPTY_FILTERS: NetworkFilters = { layers: [], kinds: [], providers: [], region: null };

/** The whole network, filtered. With providers chosen, theirs are lit and the rest are dimmed. */
export function networkRenderLinks(
  model: MapModel,
  companies: ReadonlyMap<string, Company>,
  filters: NetworkFilters,
): RenderLink[] {
  const out: RenderLink[] = [];
  const lit = filters.providers.length > 0;
  for (const link of model.links) {
    const company = companies.get(link.operator);
    if (filters.layers.length && !filters.layers.includes(link.layer)) continue;
    if (filters.kinds.length && (!company || !filters.kinds.includes(company.kind))) continue;
    if (filters.region) {
      const regions = [model.nodes.get(link.a)?.region, model.nodes.get(link.b)?.region];
      if (!regions.includes(filters.region)) continue;
    }
    const chosen = !lit || filters.providers.includes(link.operator);
    out.push({
      id: link.id,
      from: link.a,
      to: link.b,
      layer: link.layer,
      emphasis: chosen ? 'route' : 'dim',
      info: {
        carrier: name(companies, link.operator),
        layer: layerLabel(link.layer),
        lengthKm: null,
        latencyShare: null,
      },
    });
  }
  return out;
}

/** Worlds a provider covers, for lighting its coverage. */
export function providerWorlds(company: Company | undefined): ReadonlySet<string> {
  return new Set(company?.worldIds ?? []);
}

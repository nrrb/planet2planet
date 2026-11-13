/**
 * The catalog as the site reads it: worlds, regions, companies, history and meta, projected
 * from the committed dataset (data/sol-telecom-2380.json). Ordering follows the old API:
 * worlds and companies by id, regions in chain order, events by year then file order.
 */

import type { SolTelecomDataset } from '@data/sol-telecom-2380';
import type { CanonFactsFile } from './canon';
import { ApiError } from '../api/errors';
import type { Company, HistoryEvent, Meta, Region, World, WorldDetail } from '../api/types';
import { byString } from './util';

/** The date the whole site is set on. Positions, latency and conjunctions are computed for it. */
export const SITE_DATE = '2380-06-09';
export const SITE_STARDATE = '57436.2';
export const SITE_YEAR = 2380;

export class Catalog {
  private readonly worlds: SolTelecomDataset['worlds'];
  private readonly companies: SolTelecomDataset['companies'];

  constructor(
    private readonly dataset: SolTelecomDataset,
    private readonly canon: CanonFactsFile,
  ) {
    this.worlds = [...dataset.worlds].sort((a, b) => byString(a.id, b.id));
    this.companies = [...dataset.companies].sort((a, b) => byString(a.id, b.id));
  }

  meta(): Meta {
    const sources = new Map<string, { id: string; title: string; url: string }>();
    for (const s of [...this.dataset.meta.sources, ...this.canon.sources]) {
      sources.set(s.id, { id: s.id, title: s.title, url: s.url });
    }
    return {
      title: this.dataset.meta.title,
      siteDate: SITE_DATE,
      stardate: SITE_STARDATE,
      year: SITE_YEAR,
      subspaceSpeedC: this.dataset.meta.subspaceSpeedC,
      sources: [...sources.values()].sort((a, b) => byString(a.id, b.id)),
    };
  }

  worldList(): World[] {
    return this.worlds.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      parent: w.parentId,
      region: w.regionId,
      eligible: w.history.subspaceSince !== null && w.history.subspaceSince <= SITE_YEAR,
      radiusKm: w.physical.radiusKm,
    }));
  }

  worldDetail(id: string): WorldDetail {
    const w = this.worlds.find((x) => x.id === id);
    if (!w) throw new ApiError('The request failed (404).', 404);
    return {
      ...this.worldList().find((x) => x.id === id),
      gaseous: w.physical.gaseous,
      massKg: w.physical.massKg,
      surfaceGravity: w.physical.surfaceGravityMs2,
      mainElements: w.physical.mainElements,
      distanceFromSunAu: w.physical.distanceFromSunAu,
      orbitRadiusKm: w.physical.orbitRadiusKm,
      orbitalPeriodDays: w.physical.orbitalPeriodDays,
      orbitalSpeedKmS: w.physical.orbitalSpeedKmS,
      constellationEstablished: w.history.constellationEstablished,
      constellationStartedAs: w.history.constellationStartedAs ?? '',
      subspaceSince: w.history.subspaceSince,
      colonized: w.history.colonized,
      homeworld: w.history.homeworld,
      passedOneMillion: w.history.passedOneMillion,
      population: w.population,
      populationHistory: Object.fromEntries(
        Object.entries(w.populationHistory ?? {}).sort(([a], [b]) => Number(a) - Number(b)),
      ),
      subspaceLatencyToEarthMs: w.communications.subspaceLatencyToEarthMs,
      solarConjunctionWithEarthEveryDays: w.communications.solarConjunctionWithEarthEveryDays,
      canonNotes: w.canon.map((n) => ({ year: n.year, text: n.text, source: n.sourceId })),
    } as WorldDetail;
  }

  regions(): Region[] {
    return this.dataset.regions.map((r, order) => ({
      id: r.id,
      name: r.name,
      order,
      worldIds: [...this.worlds.filter((w) => w.regionId === r.id)].map((w) => w.id),
    }));
  }

  companyList(): Company[] {
    return this.companies.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      sectors: c.sectors,
      environment: c.environment || null,
      focus: c.focus,
      headquarters: c.headquartersWorldId,
      region: c.regionId,
      founded: c.founded,
      parent: c.parentId,
      origin: c.origin,
      status: c.status,
      owner: c.ownerId,
      acquiredBy: c.acquiredById,
      acquiredYear: c.acquiredYear,
      worldIds: [...c.servesWorldIds].sort(byString),
    }));
  }

  history(): HistoryEvent[] {
    return this.dataset.events
      .map((e, sequence) => ({ e, sequence }))
      .sort((a, b) => a.e.year - b.e.year || a.sequence - b.sequence)
      .map(({ e }) => ({
        year: e.year,
        type: e.type,
        world: e.worldId,
        company: e.companyId ?? null,
        buyer: e.buyerId ?? null,
        detail: e.detail || null,
      }));
  }

  /** When each world's subspace constellation started, for validating quote requests. */
  subspaceSince(): Map<string, number | null> {
    return new Map(this.dataset.worlds.map((w) => [w.id, w.history.subspaceSince]));
  }
}

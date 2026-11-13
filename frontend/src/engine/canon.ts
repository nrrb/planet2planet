/**
 * Canon facts and the Monte Carlo simulation summary, as the Canon page reads them.
 * Facts come from data/canon-facts.json; results from data/sol-montecarlo-2380.json.
 */

import type { SolTelecomDataset } from '@data/sol-telecom-2380';
import type { MonteCarloSummary } from '@data/sol-montecarlo-2380';
import { ApiError } from '../api/errors';
import type { CanonFact, Simulation, WorldStatistic } from '../api/types';
import { byString } from './util';

export interface CanonFactsFile {
  schemaVersion: string;
  sources: { id: string; title: string; url: string }[];
  facts: {
    slug: string;
    category: string;
    topic: string;
    world: string | null;
    statement: string;
    episodes: string[];
    howUsed: string;
    standing: string;
    source: string;
    deadline: { event: string; year: number; threshold?: number } | null;
    order: number;
  }[];
}

const CATEGORIES = ['starting-condition', 'deadline', 'set-aside'];
const METRICS = {
  constellation: 'constellation',
  subspace: 'subspace',
  colonized: 'colonized',
  oneMillion: 'one-million',
  population: 'population',
} as const;
const CANONICAL_FIELD: Record<string, (w: SolTelecomDataset['worlds'][number]) => number | null> = {
  constellation: (w) => w.history.constellationEstablished,
  subspace: (w) => w.history.subspaceSince,
  colonized: (w) => w.history.colonized,
  'one-million': (w) => w.history.passedOneMillion,
  population: (w) => w.population,
};

/** Formats a timestamp like the old API: microseconds when there is a fraction, then 'Z'. */
function timestamp(iso: string): string {
  const d = new Date(iso);
  const ms = d.getUTCMilliseconds();
  const base = d.toISOString().slice(0, 19);
  return ms === 0 ? `${base}Z` : `${base}.${String(ms).padStart(3, '0')}000Z`;
}

export class Canon {
  constructor(
    private readonly dataset: SolTelecomDataset,
    private readonly facts: CanonFactsFile,
    private readonly summary: MonteCarloSummary,
  ) {}

  private sources() {
    const out = new Map<string, { id: string; title: string; url: string }>();
    for (const s of [...this.dataset.meta.sources, ...this.facts.sources]) out.set(s.id, s);
    return out;
  }

  canonFacts(category?: string): CanonFact[] {
    if (category && !CATEGORIES.includes(category)) {
      throw new ApiError('The request failed (400).', 400, { category: `Unknown value '${category}'.` });
    }
    const sources = this.sources();
    return this.facts.facts
      .filter((f) => !category || f.category === category)
      .sort((a, b) => byString(a.category, b.category) || a.order - b.order)
      .map((f) => {
        const result =
          f.category === 'deadline' && f.deadline
            ? this.summary.deadlines.find(
                (d) => d.world === f.world && d.event === f.deadline?.event && d.by === f.deadline?.year,
              )
            : undefined;
        return {
          id: f.slug,
          category: f.category,
          topic: f.topic,
          world: f.world,
          statement: f.statement,
          episodes: f.episodes ?? [],
          howUsed: f.howUsed,
          standing: f.standing,
          source: sources.get(f.source),
          deadline:
            f.category === 'deadline' && f.deadline
              ? {
                  event: f.deadline.event,
                  year: f.deadline.year,
                  threshold: f.deadline.threshold ?? null,
                  shareMet: result ? result.shareMet : null,
                  medianResult: result ? result.medianResult : null,
                }
              : null,
        } as unknown as CanonFact;
      });
  }

  simulation(): Simulation {
    const run = this.summary.run;
    const market = this.summary.market;
    const rows = [
      { metric: 'brands-trading', kind: '', ...market.brandsTrading },
      ...Object.entries(market.brandsByKind).map(([kind, m]) => ({ metric: 'brands-by-kind', kind, ...m })),
      { metric: 'companies-bought', kind: '', ...market.companiesBought },
      { metric: 'companies-founded', kind: '', ...market.companiesFounded },
    ]
      .map((r) => ({ metric: r.metric, kind: r.kind, median: r.median, p10: r.p10, p90: r.p90 }))
      .sort((a, b) => byString(a.metric, b.metric) || byString(a.kind, b.kind));
    return {
      run: {
        firstSeed: run.firstSeed,
        runCount: run.runCount,
        startYear: run.startYear,
        endYear: run.endYear,
        scriptCommit: run.scriptCommit,
        generatedAt: timestamp(run.generatedAt),
        canonicalSeed: this.dataset.meta.seed,
      },
      market: rows,
    } as unknown as Simulation;
  }

  worldStatistics(metric?: string, world?: string, samples?: boolean): WorldStatistic[] {
    const fail = (field: string, message: string) => {
      throw new ApiError('The request failed (400).', 400, { [field]: message });
    };
    if (metric && !Object.values(METRICS).includes(metric as never)) fail('metric', `Unknown value '${metric}'.`);
    if (world && !this.dataset.worlds.some((w) => w.id === world)) fail('world', `Unknown world '${world}'.`);
    if (samples && !world) fail('samples', 'Samples need one world: add world=.');
    const worlds = new Map(this.dataset.worlds.map((w) => [w.id, w]));
    const rows: WorldStatistic[] = [];
    for (const w of [...this.summary.worlds].sort((a, b) => byString(a.id, b.id))) {
      if (world && w.id !== world) continue;
      const entries = Object.entries(METRICS)
        .map(([key, name]) => ({ key: key as keyof typeof METRICS, name }))
        .sort((a, b) => byString(a.name, b.name));
      for (const { key, name } of entries) {
        if (metric && name !== metric) continue;
        const m = w.metrics[key];
        rows.push({
          world: w.id,
          metric: name,
          median: m.median,
          p10: m.p10,
          p90: m.p90,
          shareOfRuns: m.shareOfRuns,
          canonical: CANONICAL_FIELD[name](worlds.get(w.id) as SolTelecomDataset['worlds'][number]),
          ...(samples ? { samples: m.samples } : {}),
        });
      }
    }
    return rows;
  }
}

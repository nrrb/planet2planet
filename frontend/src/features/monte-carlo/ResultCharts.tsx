import { useMemo } from 'react';
import { useSimulation, useWorldStatistics, useWorlds } from '../../api/hooks';
import type { WorldStatistic } from '../../api/types';
import { formatPeople } from '../../ui/format';
import { ChartFrame } from './ChartFrame';
import { linearScale, logScale, logTicks, niceTicks, yearDomain } from './scales';
import styles from './Charts.module.css';

const ROW = 17;
const LEFT = 92;
const W = 720;

function useNames(): (id: string) => string {
  const worlds = useWorlds().data;
  return (id) => worlds?.find((w) => w.id === id)?.name ?? id;
}

export interface SettlementRow {
  world: string;
  subspace: number | null;
  colony: number | null;
  p10: number | null;
  p90: number | null;
  colonizedShare: number;
}

/** One row per world, in the order the colonies were founded. */
export function settlementRows(subspace: WorldStatistic[], colonized: WorldStatistic[]): SettlementRow[] {
  const sub = new Map(subspace.map((s) => [s.world, s]));
  return colonized
    .map((c) => ({
      world: c.world,
      subspace: sub.get(c.world)?.median ?? null,
      colony: c.median,
      p10: c.p10,
      p90: c.p90,
      colonizedShare: c.shareOfRuns,
    }))
    .sort(
      (a, b) => (a.colony ?? a.subspace ?? 9999) - (b.colony ?? b.subspace ?? 9999) || a.world.localeCompare(b.world),
    );
}

function SettlementSvg({ rows, name }: { rows: SettlementRow[]; name: (id: string) => string }) {
  const values = rows.flatMap((r) => [r.subspace, r.colony, r.p10, r.p90].filter((v): v is number => v !== null));
  const [d0, d1] = yearDomain(values);
  const x = linearScale([d0, d1], [LEFT, W - 14]);
  const H = rows.length * ROW + 34;
  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Median year of each world's subspace constellation and colony, with the middle 80% of runs for the colony"
    >
      {niceTicks(d0, d1, 8).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} stroke="var(--line)" />
          <text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {t}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cy = 12 + i * ROW;
        return (
          <g key={r.world}>
            <text x={LEFT - 6} y={cy + 4} textAnchor="end" fontSize="11" fill="var(--text)">
              {name(r.world)}
            </text>
            {r.p10 !== null && r.p90 !== null && (
              <rect
                x={x(r.p10)}
                y={cy - 4}
                width={Math.max(2, x(r.p90) - x(r.p10))}
                height={8}
                fill="var(--ev-colony)"
                fillOpacity="0.25"
              />
            )}
            {r.subspace !== null && (
              <path d={`M ${x(r.subspace)} ${cy - 5} l 5 5 l -5 5 l -5 -5 z`} fill="var(--ev-constellation)" />
            )}
            {r.colony !== null && (
              <circle
                cx={x(r.colony)}
                cy={cy}
                r={3.5}
                fill="var(--ev-colony)"
                stroke="var(--text)"
                strokeWidth="0.75"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

const Legend = () => (
  <ul className={styles.legend} aria-label="Chart key">
    <li>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M 6 0 l 6 6 l -6 6 l -6 -6 z" fill="var(--ev-constellation)" />
      </svg>
      Median year of the subspace constellation
    </li>
    <li>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" fill="var(--ev-colony)" stroke="var(--text)" />
      </svg>
      Median year of the colony
    </li>
    <li>
      <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
        <rect width="18" height="10" fill="var(--ev-colony)" fillOpacity="0.25" />
      </svg>
      Middle 80% of runs for the colony
    </li>
  </ul>
);

export function SettlementChart() {
  const subspace = useWorldStatistics('subspace').data;
  const colonized = useWorldStatistics('colonized').data;
  const name = useNames();
  const rows = useMemo(() => (subspace && colonized ? settlementRows(subspace, colonized) : []), [subspace, colonized]);
  if (!subspace || !colonized) return <p role="status">Loading the results…</p>;
  return (
    <ChartFrame
      title="When each world was settled"
      summary="One row per world, earliest first. The diamond is the median year its subspace constellation went up and the circle the median year of its colony; the band is the middle 80% of runs for the colony. Earth has no colony row because it is the homeworld."
      controls={<Legend />}
      chart={<SettlementSvg rows={rows} name={name} />}
      table={
        <table className={styles.table}>
          <caption className="visually-hidden">Median years of settlement by world</caption>
          <thead>
            <tr>
              <th scope="col">World</th>
              <th scope="col" className="num">
                Subspace constellation
              </th>
              <th scope="col" className="num">
                Colony
              </th>
              <th scope="col" className="num">
                Colony, 10th percentile
              </th>
              <th scope="col" className="num">
                Colony, 90th percentile
              </th>
              <th scope="col" className="num">
                Runs colonized
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.world}>
                <th scope="row">{name(r.world)}</th>
                <td className="num">{r.subspace ?? '–'}</td>
                <td className="num">{r.colony ?? '–'}</td>
                <td className="num">{r.p10 ?? '–'}</td>
                <td className="num">{r.p90 ?? '–'}</td>
                <td className="num">{Math.round(r.colonizedShare * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export interface PopulationRow {
  world: string;
  population: number;
  millionYear: number | null;
  millionShare: number;
}

/** Worlds by median population, biggest first. A "million" year counts only if most runs got there. */
export function populationRows(population: WorldStatistic[], million: WorldStatistic[]): PopulationRow[] {
  const mil = new Map(million.map((m) => [m.world, m]));
  return population
    .filter((p) => p.median !== null)
    .map((p) => {
      const m = mil.get(p.world);
      return {
        world: p.world,
        population: p.median as number,
        millionYear: m && m.shareOfRuns > 0.5 ? m.median : null,
        millionShare: m?.shareOfRuns ?? 0,
      };
    })
    .sort((a, b) => b.population - a.population || a.world.localeCompare(b.world));
}

function PopulationSvg({ rows, name }: { rows: PopulationRow[]; name: (id: string) => string }) {
  const x = logScale([1e3, 3e8], [LEFT, W - 150]);
  const H = rows.length * ROW + 34;
  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Median population of each world in 2380 on a logarithmic scale, and the year it passed a million people"
    >
      {logTicks(1e3, 3e8).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} stroke="var(--line)" />
          <text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {formatPeople(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cy = 12 + i * ROW;
        return (
          <g key={r.world}>
            <text x={LEFT - 6} y={cy + 4} textAnchor="end" fontSize="11" fill="var(--text)">
              {name(r.world)}
            </text>
            <rect
              x={LEFT}
              y={cy - 5}
              width={Math.max(1, x(r.population) - LEFT)}
              height={10}
              fill="var(--ev-million)"
              fillOpacity="0.8"
            />
            <text x={x(r.population) + 5} y={cy + 4} fontSize="10.5" fill="var(--text)">
              {formatPeople(r.population)}
              {r.millionYear !== null ? `, 1M in ${r.millionYear}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PopulationChart() {
  const population = useWorldStatistics('population').data;
  const million = useWorldStatistics('one-million').data;
  const name = useNames();
  const rows = useMemo(() => (population && million ? populationRows(population, million) : []), [population, million]);
  if (!population || !million) return <p role="status">Loading the results…</p>;
  return (
    <ChartFrame
      title="How many people live on each world in 2380"
      summary="Median population across the runs, on a logarithmic scale so that a 20,000-person station and a 150-million-person world fit one chart. Beside each bar is the median year the world passed a million people, where most runs got there. Earth is not modelled."
      chart={<PopulationSvg rows={rows} name={name} />}
      table={
        <table className={styles.table}>
          <caption className="visually-hidden">
            Median population in 2380 and the year each world passed a million
          </caption>
          <thead>
            <tr>
              <th scope="col">World</th>
              <th scope="col" className="num">
                Median population, 2380
              </th>
              <th scope="col" className="num">
                Median year past a million
              </th>
              <th scope="col" className="num">
                Runs past a million
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.world}>
                <th scope="row">{name(r.world)}</th>
                <td className="num">{formatPeople(r.population)}</td>
                <td className="num">{r.millionYear ?? '–'}</td>
                <td className="num">{Math.round(r.millionShare * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

const MARKET_LABELS: Record<string, string> = {
  'companies-founded': 'Companies founded',
  'brands-trading': 'Brands still trading in 2380',
  'companies-bought': 'Companies bought at some point',
};

export function MarketFigures() {
  const simulation = useSimulation().data;
  if (!simulation) return <p role="status">Loading the results…</p>;
  const rows = simulation.market.map((m) => ({
    label: m.metric === 'brands-by-kind' ? `Brands trading: ${m.kind}` : (MARKET_LABELS[m.metric] ?? m.metric),
    ...m,
  }));
  return (
    <div className={styles.frame}>
      <div className={styles.head}>
        <h3>The telecom market</h3>
      </div>
      <p className={styles.summary}>
        Median across {simulation.run.runCount} runs, with the middle 80% in brackets. The shop’s own world has the
        figures in the dataset.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Market figures across the runs</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="num">
                Median
              </th>
              <th scope="col" className="num">
                10th to 90th percentile
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.metric}-${r.kind}`}>
                <th scope="row">{r.label}</th>
                <td className="num">{r.median}</td>
                <td className="num">
                  {r.p10} to {r.p90}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

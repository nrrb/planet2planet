import { useId, useMemo, useState } from 'react';
import { useWorldStatistics, useWorlds } from '../../api/hooks';
import { ChartFrame } from './ChartFrame';
import { linearScale, niceTicks, stackDots, yearDomain } from './scales';
import styles from './Charts.module.css';

const W = 720;
const M = { left: 16, right: 16, top: 26, bottom: 46 };
const H = 246;

interface PlotProps {
  samples: number[];
  median: number | null;
  p10: number | null;
  p90: number | null;
  canonical: number | null;
  canonicalSeed: number;
  name: string;
}

/** One dot per run for the year a world was colonized. Pure drawing: all numbers come in as props. */
export function StripPlotChart({ samples, median, p10, p90, canonical, canonicalSeed, name }: PlotProps) {
  const [d0, d1] = useMemo(() => yearDomain([...samples, ...(canonical ? [canonical] : [])]), [samples, canonical]);
  const x = useMemo(() => linearScale([d0, d1], [M.left, W - M.right]), [d0, d1]);
  const dots = useMemo(() => stackDots(samples, x), [samples, x]);
  const maxRow = Math.max(0, ...dots.map((d) => d.row));
  const plotH = H - M.top - M.bottom;
  const r = Math.max(1.2, Math.min(3.2, plotH / (2 * (maxRow + 1))));
  const y = (row: number) => H - M.bottom - r - row * r * 2;
  const label = `${name}: colonized between ${p10} and ${p90} in the middle 80% of ${samples.length} runs, median ${median}. The run the shop uses (seed ${canonicalSeed}) is ${canonical ?? 'not colonized'}.`;
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {p10 !== null && p90 !== null && (
        <rect x={x(p10)} y={M.top} width={Math.max(2, x(p90) - x(p10))} height={plotH} fill="var(--surface-3)" />
      )}
      {niceTicks(d0, d1, 8).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={H - M.bottom} y2={H - M.bottom + 4} stroke="var(--line-strong)" />
          <text x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {t}
          </text>
        </g>
      ))}
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--line-strong)" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={y(d.row)} r={r} fill="var(--ev-constellation)" fillOpacity="0.75" />
      ))}
      {median !== null && (
        <g>
          <line x1={x(median)} x2={x(median)} y1={M.top} y2={H - M.bottom} stroke="var(--text)" strokeWidth="2" />
          <text x={x(median)} y={M.top - 12} textAnchor="middle" fontSize="11" fontWeight="650" fill="var(--text)">
            median {median}
          </text>
        </g>
      )}
      {p10 !== null && p90 !== null && (
        <text x={(x(p10) + x(p90)) / 2} y={M.top - 1} textAnchor="middle" fontSize="10" fill="var(--muted)">
          10th to 90th percentile: {p10} to {p90}
        </text>
      )}
      {canonical !== null && (
        <g>
          <path
            d={`M ${x(canonical)} ${H - M.bottom - 2} l -6 -11 l 12 0 z`}
            fill="var(--ev-acquired)"
            stroke="var(--text)"
            strokeWidth="1"
          />
          {/* The label sits under the axis so it never covers a dot. */}
          <text x={x(canonical)} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="650" fill="var(--text)">
            ▲ seed {canonicalSeed}: {canonical}
          </text>
        </g>
      )}
    </svg>
  );
}

function SamplesTable({ samples, name }: { samples: number[]; name: string }) {
  const counts = new Map<number, number>();
  for (const v of samples) counts.set(v, (counts.get(v) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <table className={styles.table}>
      <caption className="visually-hidden">Runs by the year {name} was colonized</caption>
      <thead>
        <tr>
          <th scope="col" className="num">
            Year colonized
          </th>
          <th scope="col" className="num">
            Runs
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([year, n]) => (
          <tr key={year}>
            <td className="num">{year}</td>
            <td className="num">{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The Monte Carlo spread for one world, with a picker. Titan to start with. */
export function StripPlot({ canonicalSeed, defaultWorld = 'titan' }: { canonicalSeed: number; defaultWorld?: string }) {
  const [world, setWorld] = useState(defaultWorld);
  const worlds = useWorlds().data;
  const colonized = useWorldStatistics('colonized').data;
  const one = useWorldStatistics('colonized', world).data?.[0];
  const pickerId = useId();
  const choices = (colonized ?? []).filter((s) => s.shareOfRuns > 0 && s.median !== null);
  const name = worlds?.find((w) => w.id === world)?.name ?? world;
  const picker = (
    <div className={styles.picker}>
      <label htmlFor={pickerId}>World</label>
      <select id={pickerId} value={world} onChange={(e) => setWorld(e.target.value)}>
        {choices.map((s) => (
          <option key={s.world} value={s.world}>
            {worlds?.find((w) => w.id === s.world)?.name ?? s.world}
          </option>
        ))}
      </select>
    </div>
  );
  if (!one) return <p role="status">Loading the spread…</p>;
  const samples = one.samples ?? [];
  return (
    <ChartFrame
      title={`When was ${name} colonized? One dot per run`}
      summary={`Each of the ${samples.length} dots is one complete simulated history. The shaded band covers the middle 80% of runs and the line marks the median. The triangle is seed ${canonicalSeed}, the history this site uses.`}
      controls={picker}
      chart={
        <StripPlotChart
          samples={samples}
          median={one.median}
          p10={one.p10}
          p90={one.p90}
          canonical={one.canonical}
          canonicalSeed={canonicalSeed}
          name={name}
        />
      }
      table={
        <>
          <SamplesTable samples={samples} name={name} />
          <p style={{ padding: '4px 8px' }}>
            Median {one.median}; 10th percentile {one.p10}; 90th percentile {one.p90}; seed {canonicalSeed} colonized it
            in {one.canonical ?? 'no year'}.
          </p>
        </>
      }
    />
  );
}

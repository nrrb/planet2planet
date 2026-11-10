import { useCanonFacts } from '../../api/hooks';
import type { CanonFact } from '../../api/types';
import styles from '../../ui/Section.module.css';
import { CanonLabel } from './CanonLabel';

function Source({ fact }: { fact: CanonFact }) {
  return (
    <>
      <a href={fact.source.url} target="_blank" rel="noreferrer">
        {fact.source.title}
      </a>{' '}
      <span className={styles.note}>(opens in a new tab)</span>
    </>
  );
}

function Episodes({ episodes }: { episodes: string[] }) {
  return episodes.length ? <>{episodes.join('; ')}</> : <span className={styles.note}>No single episode</span>;
}

function Loading({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert">The canon facts could not be loaded. Try reloading the page.</p>
  ) : (
    <p role="status">Loading the canon facts…</p>
  );
}

const share = (value: number | null) => (value === null ? 'Not run' : `${Math.round(value * 100)}% of runs`);

function describeResult(fact: CanonFact): string {
  const d = fact.deadline;
  if (!d || d.medianResult === null) return 'No result';
  if (d.event === 'population') return `${(d.medianResult / 1e6).toFixed(0)} million`;
  return `${d.event === 'colonized' ? 'Colonized' : 'Constellation'} ${Math.round(d.medianResult)}`;
}

export function StartingConditions() {
  const { data, error } = useCanonFacts('starting-condition');
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Facts from canon that the simulation treats as fixed</caption>
        <thead>
          <tr>
            <th scope="col">Fact</th>
            <th scope="col">What is stated on screen</th>
            <th scope="col">Episodes</th>
            <th scope="col">How it is used</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.map((fact) => (
            <tr key={fact.id}>
              <th scope="row">
                {fact.topic} <CanonLabel kind={fact.standing} />
              </th>
              <td>{fact.statement}</td>
              <td>
                <Episodes episodes={fact.episodes} />
              </td>
              <td>{fact.howUsed}</td>
              <td>
                <Source fact={fact} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Deadlines() {
  const { data, error } = useCanonFacts('deadline');
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          The latest date canon allows for each world, and how often the simulation met it
        </caption>
        <thead>
          <tr>
            <th scope="col">World</th>
            <th scope="col">What canon says</th>
            <th scope="col">Episodes</th>
            <th scope="col">Latest date canon allows</th>
            <th scope="col">Simulated median</th>
            <th scope="col">Runs that met it</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.map((fact) => (
            <tr key={fact.id}>
              <th scope="row">
                {fact.topic} <CanonLabel kind={fact.standing} />
              </th>
              <td>{fact.statement}</td>
              <td>
                <Episodes episodes={fact.episodes} />
              </td>
              <td className="figure">
                {fact.deadline?.event === 'population'
                  ? `${((fact.deadline.threshold ?? 0) / 1e6).toFixed(0)} million by ${fact.deadline.year}`
                  : `${fact.deadline?.year}`}
              </td>
              <td className="figure">{describeResult(fact)}</td>
              <td className="figure">{share(fact.deadline?.shareMet ?? null)}</td>
              <td>
                <Source fact={fact} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SetAside() {
  const { data, error } = useCanonFacts('set-aside');
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Claims that were left out, and why</caption>
        <thead>
          <tr>
            <th scope="col">Claim</th>
            <th scope="col">Where it comes from</th>
            <th scope="col">Why it is not used</th>
            <th scope="col">Related episodes</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.map((fact) => (
            <tr key={fact.id}>
              <th scope="row">{fact.topic}</th>
              <td>
                <CanonLabel kind={fact.standing} />
              </td>
              <td>{fact.howUsed}</td>
              <td>
                <Episodes episodes={fact.episodes} />
              </td>
              <td>
                <Source fact={fact} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

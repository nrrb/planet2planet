import { useMeta, useWorldDetail } from '../../api/hooks';
import { SUBSPACE } from '../../content/about';
import { formatDuration, formatLatency, formatSpan } from '../../ui/format';
import styles from './Section.module.css';

/** Earth to each of these, from the delays in the dataset. */
const EXAMPLES = [
  { id: 'moon', label: 'Earth to the Moon' },
  { id: 'mars', label: 'Earth to Mars' },
  { id: 'jupiter', label: 'Earth to Jupiter' },
  { id: 'eris', label: 'Earth to Eris' },
];

function Row({ id, label, speedC }: { id: string; label: string; speedC: number }) {
  const { data } = useWorldDetail(id);
  const delay = data?.subspaceLatencyToEarthMs;
  if (!delay) {
    return (
      <tr>
        <th scope="row">{label}</th>
        <td colSpan={2}>…</td>
      </tr>
    );
  }
  const radio = (ms: number) => (ms / 1000) * speedC;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="figure">{formatSpan(delay.min, delay.max, formatLatency)}</td>
      <td>{formatSpan(radio(delay.min), radio(delay.max), formatDuration)}</td>
    </tr>
  );
}

export function Subspace() {
  const meta = useMeta();
  const speedC = meta.data?.subspaceSpeedC ?? 52_000;
  return (
    <>
      <div className={styles.prose}>
        <h3 className={styles.sub}>{SUBSPACE.speed.heading}</h3>
        {SUBSPACE.speed.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">One-way delay from Earth, subspace and light-speed radio</caption>
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col">Subspace, one way</th>
              <th scope="col">Light-speed radio, one way</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((example) => (
              <Row key={example.id} {...example} speedC={speedC} />
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.prose}>
        <h3 className={styles.sub}>{SUBSPACE.history.heading}</h3>
        <ul className={styles.list}>
          {SUBSPACE.history.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      <h3 className={styles.sub}>{SUBSPACE.compare.heading}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {SUBSPACE.compare.columns.map((c, i) => (
                <th key={c || 'blank'} scope="col">
                  {i === 0 ? <span className="visually-hidden">Property</span> : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUBSPACE.compare.rows.map(([property, ...cells]) => (
              <tr key={property}>
                <th scope="row">{property}</th>
                {cells.map((cell, i) => (
                  <td key={SUBSPACE.compare.columns[i + 1]}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>{SUBSPACE.compare.note}</p>
    </>
  );
}

import { TIERS, TIERS_INTRO } from '../../content/about';
import styles from './Section.module.css';

export function Tiers() {
  return (
    <>
      <p className={styles.prose}>{TIERS_INTRO}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Redundancy tiers and the events behind them</caption>
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">What it adds</th>
              <th scope="col">Why it is worth paying for</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier) => (
              <tr key={tier.id}>
                <th scope="row">{tier.name}</th>
                <td>{tier.adds}</td>
                <td>{tier.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

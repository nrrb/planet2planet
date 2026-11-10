import type { Offer } from '../../api/types';
import { ENVIRONMENT_LABELS, SECTOR_LABELS } from '../../content/labels';
import { formatCredits, formatLatency, formatLatencyRange, formatShare } from '../../ui/format';
import { classLabel, conjunctionShort, routeShort, tierLabel } from '../results/offerView';
import { type CompanyMap, providerLine } from '../results/providers';
import styles from '../results/Results.module.css';

interface Props {
  offers: Offer[];
  companies: CompanyMap;
  onRemove: (id: string) => void;
}

const list = (values: string[], labels: Record<string, string>): string =>
  values.length ? values.map((v) => labels[v] ?? v).join(', ') : 'None';

/** Up to three offers side by side. */
export function CompareSheet({ offers, companies, onRemove }: Props) {
  const rows: [string, (o: Offer) => string][] = [
    ['Provider', (o) => providerLine(o, companies)],
    ['Monthly price', (o) => formatCredits(o.price.monthly)],
    ['Setup fee', (o) => formatCredits(o.price.setup)],
    ['Latency today', (o) => formatLatency(o.latencyMs.now)],
    ['Latency over the year', (o) => formatLatencyRange(o.latencyMs.min, o.latencyMs.max)],
    ['Service', classLabel],
    ['Route', routeShort],
    ['On the lead network', (o) => formatShare(o.onNetworkShare)],
    ['Solar conjunction', conjunctionShort],
    ['Redundancy tier', tierLabel],
    ['Sectors', (o) => list(o.sectors, SECTOR_LABELS)],
    ['Hardened for', (o) => list(o.environments, ENVIRONMENT_LABELS)],
  ];
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Selected plans side by side</caption>
        <thead>
          <tr>
            <td />
            {offers.map((offer) => (
              <th key={offer.id} scope="col">
                <div>{offer.title}</div>
                <button type="button" className={styles.sortButton} onClick={() => onRemove(offer.id)}>
                  Remove {offer.title}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {offers.map((offer) => (
                <td key={offer.id} className={label.startsWith('Monthly') ? 'figure' : undefined}>
                  {value(offer)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

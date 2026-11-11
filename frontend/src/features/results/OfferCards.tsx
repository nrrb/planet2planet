import type { Offer } from '../../api/types';
import { BADGE_LABELS } from '../../content/labels';
import { LatencyBar } from '../../ui/LatencyBar';
import { OfferDetails } from './OfferDetails';
import {
  classLabel,
  conjunctionLong,
  conjunctionShort,
  hardeningText,
  type OfferItemProps,
  tierLabel,
} from './offerView';
import { providerLine } from './providers';
import { directionLabel, SORT_KEYS, SORT_LABELS, type SortDir, type SortKey } from './sorting';
import tableStyles from './OfferTable.module.css';
import styles from './OfferCards.module.css';

const TAG_CLASS: Record<string, string> = {
  'lowest-price': tableStyles.tagPrice,
  'lowest-latency': tableStyles.tagLatency,
  'most-resilient': tableStyles.tagResilient,
};

const plain = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ms = (n: number) => (n >= 100 ? plain(n, 0) : plain(n, 1));

function Card(props: OfferItemProps) {
  const { offer, compared, compareFull, detailsOpen, scale } = props;
  return (
    <li className={`${styles.card} ${compared ? styles.compared : ''}`}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>{offer.title}</h3>
          {offer.kind === 'package' && <span className={styles.kind}>package</span>}
          {offer.badges.map((badge) => (
            <span key={badge} className={`${tableStyles.tag} ${TAG_CLASS[badge] ?? ''}`}>
              {BADGE_LABELS[badge] ?? badge}
            </span>
          ))}
        </div>
        <label className={styles.compare}>
          <input
            type="checkbox"
            checked={compared}
            disabled={!compared && compareFull}
            onChange={props.onToggleCompare}
            aria-label={`Compare ${offer.title}`}
          />
          <span aria-hidden="true">Compare</span>
        </label>
      </div>
      <p className={styles.provider}>{providerLine(offer, props.companies)}</p>

      <div className={styles.figures}>
        <div className={styles.price}>
          <span className={`${styles.big} figure`}>{plain(offer.price.monthly)}</span>
          <span className={styles.unit}> cr a month</span>
          <div className={styles.sub}>Setup {plain(offer.price.setup)} cr</div>
        </div>
        <div className={styles.latency}>
          <span className={`${styles.big} figure`}>{ms(offer.latencyMs.now)} ms now</span>
          <div className={styles.sub}>
            Best {ms(offer.latencyMs.min)}, worst {ms(offer.latencyMs.max)} ms
          </div>
        </div>
      </div>
      <LatencyBar
        now={offer.latencyMs.now}
        min={offer.latencyMs.min}
        max={offer.latencyMs.max}
        scaleMin={scale.min}
        scaleMax={scale.max}
      />

      <dl className={styles.facts}>
        <div>
          <dt>Class</dt>
          <dd>{classLabel(offer)}</dd>
        </div>
        <div>
          <dt>Throughput</dt>
          <dd>{offer.throughput} Gq/s</dd>
        </div>
        <div>
          <dt>Redundancy</dt>
          <dd>{tierLabel(offer)}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {offer.hops} hops, {offer.handoffs} {offer.handoffs === 1 ? 'hand-off' : 'hand-offs'}
          </dd>
        </div>
        <div>
          <dt>Conjunction</dt>
          <dd title={conjunctionLong(offer)}>{conjunctionShort(offer)}</dd>
        </div>
        <div>
          <dt>Hardened for</dt>
          <dd>{hardeningText(offer)}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <button type="button" className={tableStyles.mini} onClick={props.onShowRoute}>
          Route
        </button>
        <button type="button" className={tableStyles.mini} aria-expanded={detailsOpen} onClick={props.onToggleDetails}>
          {detailsOpen ? 'Hide' : 'Details'}
        </button>
        <button type="button" className={`${tableStyles.mini} ${tableStyles.request}`} onClick={props.onRequest}>
          Request
        </button>
      </div>
      {detailsOpen && (
        <div className={styles.details}>
          <OfferDetails offer={offer} from={props.from} to={props.to} id={`details-${offer.id}`} />
        </div>
      )}
    </li>
  );
}

interface Props {
  offers: Offer[];
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  rowProps: (offer: Offer) => OfferItemProps;
}

/** The plans as cards, for narrow screens where a table of 18 columns cannot fit. */
export function OfferCards({ offers, sort, dir, onSort, rowProps }: Props) {
  return (
    <>
      <div className={styles.sortBar}>
        <label className={styles.sortLabel}>
          Sort by
          <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)}>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={tableStyles.mini} onClick={() => onSort(sort)}>
          <span aria-hidden="true">{dir === 'asc' ? '▲ ' : '▼ '}</span>
          {directionLabel(sort, dir)}
        </button>
      </div>
      <ul className={styles.list} aria-label="Plans">
        {offers.map((offer) => (
          <Card key={offer.id} {...rowProps(offer)} />
        ))}
      </ul>
      <p className={styles.units}>
        Prices are in credits (cr) a month. Latency is one-way. Gq/s is gigaquads per second.
      </p>
    </>
  );
}

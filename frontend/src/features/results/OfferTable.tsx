import { Fragment } from 'react';
import type { Offer } from '../../api/types';
import { SORT_LABELS, type SortKey } from '../../content/labels';
import { Badge } from '../../ui/Badge';
import { formatCredits, formatLatency, formatLatencyRange, formatShare } from '../../ui/format';
import { LatencyBar } from '../../ui/LatencyBar';
import { OfferActions } from './OfferActions';
import { OfferDetails } from './OfferDetails';
import { classLabel, conjunctionShort, type OfferItemProps, routeShort, tierLabel } from './offerView';
import { providerLine } from './providers';
import styles from './Results.module.css';

type RowProps = Omit<OfferItemProps, 'scale'> & { scale: OfferItemProps['scale'] };

function SortHeader({
  sortKey,
  active,
  onSort,
}: {
  sortKey: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th scope="col" aria-sort={sortKey === active ? 'ascending' : 'none'}>
      <button
        type="button"
        className={styles.sortButton}
        aria-pressed={sortKey === active}
        onClick={() => onSort(sortKey)}
      >
        {SORT_LABELS[sortKey]}
      </button>
    </th>
  );
}

function OfferRow(props: RowProps) {
  const { offer, companies, scale, detailsOpen } = props;
  return (
    <Fragment>
      <tr className={detailsOpen ? styles.rowOpen : undefined}>
        <td className={styles.cellPlan}>
          <strong>{offer.title}</strong>
          <div className={styles.provider}>{providerLine(offer, companies)}</div>
          {offer.badges.length > 0 && (
            <div className={styles.badges}>
              {offer.badges.map((badge) => (
                <Badge key={badge} kind={badge} />
              ))}
            </div>
          )}
          <OfferActions {...props} />
        </td>
        <td className={styles.num}>
          <span className={`${styles.monthly} figure`}>{formatCredits(offer.price.monthly)}</span>
          <span className={styles.setup}>{formatCredits(offer.price.setup)} setup</span>
        </td>
        <td className={styles.cellLatency}>
          <span className={`${styles.latencyNow} figure`}>{formatLatency(offer.latencyMs.now)}</span>
          <LatencyBar
            now={offer.latencyMs.now}
            min={offer.latencyMs.min}
            max={offer.latencyMs.max}
            scaleMin={scale.min}
            scaleMax={scale.max}
          />
          <span className={`${styles.setup} figure`}>
            {formatLatencyRange(offer.latencyMs.min, offer.latencyMs.max)}
          </span>
        </td>
        <td>
          {classLabel(offer)}
          <div className={styles.setup}>{tierLabel(offer)} redundancy</div>
        </td>
        <td>
          {routeShort(offer)}
          <div className={styles.setup}>{formatShare(offer.onNetworkShare)} on the lead network</div>
          <div className={styles.setup}>{conjunctionShort(offer)}</div>
        </td>
      </tr>
      {detailsOpen && (
        <tr className={styles.detailsRow}>
          <td colSpan={5}>
            <OfferDetails offer={offer} from={props.from} to={props.to} id={`details-${offer.id}`} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

interface TableProps {
  offers: Offer[];
  sort: SortKey;
  onSort: (key: SortKey) => void;
  rowProps: (offer: Offer) => RowProps;
}

/** All offers in a sortable table, from the lg breakpoint. */
export function OfferTable({ offers, sort, onSort, rowProps }: TableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Plans that connect the two worlds</caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <SortHeader sortKey="price" active={sort} onSort={onSort} />
            <SortHeader sortKey="latency" active={sort} onSort={onSort} />
            <th scope="col">Service and redundancy</th>
            <th scope="col">Route and solar conjunction</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <OfferRow key={offer.id} {...rowProps(offer)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

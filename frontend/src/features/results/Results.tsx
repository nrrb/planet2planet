import type { Offer } from '../../api/types';
import { ApiError } from '../../api/client';
import { SORT_LABELS, type SortKey } from '../../content/labels';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { OfferCard } from './OfferCard';
import { OfferTable } from './OfferTable';
import type { OfferItemProps } from './offerView';
import { type CompanyMap, latencyScale } from './providers';
import styles from './Results.module.css';

interface Props {
  offers: Offer[] | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  fromName: string;
  toName: string;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  filtered: boolean;
  onResetFilters: () => void;
  companies: CompanyMap;
  from: string;
  to: string;
  compare: string[];
  maxCompare: number;
  openOffer: string | null;
  onToggleCompare: (id: string) => void;
  onToggleDetails: (id: string) => void;
  onShowRoute: (offer: Offer) => void;
  onRequest: (offer: Offer) => void;
}

function errorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 400) {
    return Object.values(error.fields).join(' ') || 'Those choices are not valid together.';
  }
  return error instanceof ApiError && error.message ? error.message : 'Something went wrong loading plans.';
}

export function Results(props: Props) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const { offers, error, loading } = props;

  if (error && !offers) {
    return (
      <div className={`${styles.state} ${styles.stateError}`} role="alert">
        <p>{errorMessage(error)}</p>
        <button type="button" className={styles.button} onClick={props.onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!offers) {
    return (
      <p role="status" className={styles.state}>
        Loading plans…
      </p>
    );
  }

  const scale = latencyScale(offers);
  const rowProps = (offer: Offer): OfferItemProps => ({
    offer,
    companies: props.companies,
    scale,
    from: props.from,
    to: props.to,
    compared: props.compare.includes(offer.id),
    compareFull: props.compare.length >= props.maxCompare,
    detailsOpen: props.openOffer === offer.id,
    onToggleCompare: () => props.onToggleCompare(offer.id),
    onToggleDetails: () => props.onToggleDetails(offer.id),
    onShowRoute: () => props.onShowRoute(offer),
    onRequest: () => props.onRequest(offer),
  });

  return (
    <div aria-busy={loading}>
      <div className={styles.head}>
        <p className={styles.count} role="status" aria-live="polite">
          {offers.length === 0
            ? 'No plans match these filters'
            : `${offers.length} ${offers.length === 1 ? 'plan' : 'plans'} from ${props.fromName} to ${props.toName}`}
        </p>
        <label className={styles.sort}>
          Sort by
          <select value={props.sort} onChange={(event) => props.onSort(event.target.value as SortKey)}>
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {offers.length === 0 ? (
        <div className={styles.state}>
          <p>{props.filtered ? 'No plan matches every filter you chose.' : 'No plans connect these worlds.'}</p>
          {props.filtered && (
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={props.onResetFilters}>
              Reset filters
            </button>
          )}
        </div>
      ) : wide ? (
        <OfferTable offers={offers} sort={props.sort} onSort={props.onSort} rowProps={rowProps} />
      ) : (
        <ul className={styles.list}>
          {offers.map((offer) => (
            <OfferCard key={offer.id} {...rowProps(offer)} />
          ))}
        </ul>
      )}
    </div>
  );
}

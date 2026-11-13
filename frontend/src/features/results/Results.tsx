import { useMemo } from 'react';
import { ApiError } from '../../api/client';
import type { Offer } from '../../api/types';
import { useMediaQuery } from '../../ui/useMediaQuery';
import { OfferCards } from './OfferCards';
import { OfferTable } from './OfferTable';
import type { OfferItemProps } from './offerView';
import { type CompanyMap, companyName, latencyScale } from './providers';
import { type SortDir, type SortKey, sortOffers } from './sorting';
import styles from './Results.module.css';

interface Props {
  offers: Offer[] | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  fromName: string;
  toName: string;
  sort: SortKey;
  dir: SortDir;
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
  /** Shown beside the count, e.g. the compare button. */
  toolbar?: React.ReactNode;
}

function errorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 400) {
    return Object.values(error.fields).join(' ') || 'Those choices are not valid together.';
  }
  return error instanceof ApiError && error.message ? error.message : 'Something went wrong loading plans.';
}

/** Below this width a table of 18 columns cannot fit, so plans become cards. */
export const CARDS_QUERY = '(max-width: 767px)';

export function Results(props: Props) {
  const asCards = useMediaQuery(CARDS_QUERY);
  const { offers, error, loading, companies, sort, dir } = props;
  const sorted = useMemo(
    () => (offers ? sortOffers(offers, sort, dir, (o) => companyName(companies, o.leadCompanyId)) : undefined),
    [offers, sort, dir, companies],
  );

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
  if (!sorted) {
    return (
      <p role="status" className={styles.state}>
        Loading plans…
      </p>
    );
  }

  const scale = latencyScale(sorted);
  const rowProps = (offer: Offer): OfferItemProps => ({
    offer,
    companies,
    scale,
    from: props.from,
    to: props.to,
    compared: props.compare.includes(offer.id),
    compareFull: props.compare.length >= props.maxCompare,
    detailsOpen: props.openOffer === offer.id,
    onToggleCompare: () => props.onToggleCompare(offer.id),
    onToggleDetails: () => props.onToggleDetails(offer.id),
    onShowRoute: () => props.onShowRoute(offer),
  });

  return (
    <div aria-busy={loading}>
      <div className={styles.head}>
        <p className={styles.count} role="status" aria-live="polite">
          {sorted.length === 0
            ? 'No plans match these filters'
            : `${sorted.length} ${sorted.length === 1 ? 'plan' : 'plans'} from ${props.fromName} to ${props.toName}`}
        </p>
        {props.toolbar}
      </div>
      {sorted.length === 0 ? (
        <div className={styles.state}>
          <p>{props.filtered ? 'No plan matches every filter you chose.' : 'No plans connect these worlds.'}</p>
          {props.filtered && (
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={props.onResetFilters}>
              Reset filters
            </button>
          )}
        </div>
      ) : asCards ? (
        <OfferCards offers={sorted} sort={sort} dir={dir} onSort={props.onSort} rowProps={rowProps} />
      ) : (
        <OfferTable offers={sorted} sort={sort} dir={dir} onSort={props.onSort} rowProps={rowProps} />
      )}
    </div>
  );
}

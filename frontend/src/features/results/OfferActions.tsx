import type { Offer } from '../../api/types';
import styles from './Results.module.css';

interface Props {
  offer: Offer;
  compared: boolean;
  compareFull: boolean;
  detailsOpen: boolean;
  onToggleCompare: () => void;
  onToggleDetails: () => void;
  onShowRoute: () => void;
}

export function OfferActions({
  offer,
  compared,
  compareFull,
  detailsOpen,
  onToggleCompare,
  onToggleDetails,
  onShowRoute,
}: Props) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.button} onClick={onShowRoute}>
        Show route
      </button>
      <button type="button" className={styles.button} aria-expanded={detailsOpen} onClick={onToggleDetails}>
        {detailsOpen ? 'Hide details' : 'Details'}
      </button>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={compared}
          disabled={!compared && compareFull}
          onChange={onToggleCompare}
          aria-label={`Compare ${offer.title}`}
        />
        Compare
      </label>
    </div>
  );
}

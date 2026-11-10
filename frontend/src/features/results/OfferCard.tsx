import { Badge } from '../../ui/Badge';
import { formatCredits, formatLatency, formatLatencyRange, formatShare } from '../../ui/format';
import { LatencyBar } from '../../ui/LatencyBar';
import { OfferActions } from './OfferActions';
import { OfferDetails } from './OfferDetails';
import { classLabel, conjunctionShort, type OfferItemProps, routeShort, tierLabel } from './offerView';
import { providerLine } from './providers';
import styles from './Results.module.css';

/** One offer on a phone or tablet. */
export function OfferCard(props: OfferItemProps) {
  const { offer, companies, scale, detailsOpen } = props;
  const detailsId = `details-${offer.id}`;
  return (
    <li className={`${styles.card} ${detailsOpen ? styles.cardOpen : ''}`}>
      <div className={styles.titleRow}>
        <div>
          <h3 className={styles.title}>{offer.title}</h3>
          <p className={styles.provider}>{providerLine(offer, companies)}</p>
          {offer.badges.length > 0 && (
            <div className={styles.badges}>
              {offer.badges.map((badge) => (
                <Badge key={badge} kind={badge} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.price}>
          <span className={`${styles.monthly} figure`}>{formatCredits(offer.price.monthly)}</span>
          <span className={styles.setup}>a month, {formatCredits(offer.price.setup)} setup</span>
        </div>
      </div>
      <div className={styles.latency}>
        <div className={styles.latencyText}>
          <span>
            Latency today <span className={`${styles.latencyNow} figure`}>{formatLatency(offer.latencyMs.now)}</span>
          </span>
          <span className="figure">{formatLatencyRange(offer.latencyMs.min, offer.latencyMs.max)}</span>
        </div>
        <LatencyBar
          now={offer.latencyMs.now}
          min={offer.latencyMs.min}
          max={offer.latencyMs.max}
          scaleMin={scale.min}
          scaleMax={scale.max}
        />
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Service</dt>
          <dd>{classLabel(offer)}</dd>
        </div>
        <div>
          <dt>Redundancy</dt>
          <dd>{tierLabel(offer)}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {routeShort(offer)}, {formatShare(offer.onNetworkShare)} on the lead network
          </dd>
        </div>
        <div>
          <dt>Solar conjunction</dt>
          <dd>{conjunctionShort(offer)}</dd>
        </div>
      </dl>
      <OfferActions {...props} />
      {detailsOpen && <OfferDetails offer={offer} from={props.from} to={props.to} id={detailsId} />}
    </li>
  );
}

import { useCompanies } from '../../api/hooks';
import type { Offer } from '../../api/types';
import { formatLatency } from '../../ui/format';
import { companyMap } from '../results/providers';
import { RouteMap } from '../route-map/RouteMap';
import { SegmentList } from '../results/SegmentList';
import { useNodeLabel } from '../results/useNodeLabel';
import styles from './RouteDialogContent.module.css';

interface Props {
  offer: Offer;
  from: string;
  to: string;
}

/** The route as a map and as text. The list is also the map's text alternative. */
export function RouteDialogContent({ offer, from, to }: Props) {
  const companies = companyMap(useCompanies().data);
  const nodeLabel = useNodeLabel();
  return (
    <div className={styles.layout}>
      <RouteMap offer={offer} from={from} to={to} />
      <div className={styles.text}>
        <p>
          {offer.hops} hops, {offer.handoffs} {offer.handoffs === 1 ? 'handoff' : 'handoffs'}, one-way latency{' '}
          <span className="figure">{formatLatency(offer.latencyMs.now)}</span> today.
        </p>
        <SegmentList segments={offer.segments} companies={companies} nodeLabel={nodeLabel} />
      </div>
    </div>
  );
}

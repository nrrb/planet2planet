import { useCompanies } from '../../api/hooks';
import type { Offer } from '../../api/types';
import { formatLatency } from '../../ui/format';
import { companyMap } from '../results/providers';
import { SegmentList } from '../results/SegmentList';
import { useNodeLabel } from '../results/useNodeLabel';

/** The chosen route, as text. The map is added above this in the Maps milestone. */
export function RouteDialogContent({ offer }: { offer: Offer }) {
  const companies = companyMap(useCompanies().data);
  const nodeLabel = useNodeLabel();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p>
        {offer.hops} hops, {offer.handoffs} {offer.handoffs === 1 ? 'handoff' : 'handoffs'}, one-way latency{' '}
        <span className="figure">{formatLatency(offer.latencyMs.now)}</span> today.
      </p>
      <SegmentList segments={offer.segments} companies={companies} nodeLabel={nodeLabel} />
    </div>
  );
}

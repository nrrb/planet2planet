import type { Segment } from '../../api/types';
import { LAYER_LABELS } from '../../content/labels';
import { formatLatency } from '../../ui/format';
import { type CompanyMap, companyName } from './providers';

interface Props {
  segments: Segment[];
  companies: CompanyMap;
  nodeLabel: (id: string) => string;
}

/** The route as text: who carries which leg. Also the text alternative to the map. */
export function SegmentList({ segments, companies, nodeLabel }: Props) {
  return (
    <ol aria-label="Route segments">
      {segments.map((segment, index) => {
        const ends = [segment.nodeIds[0], segment.nodeIds[segment.nodeIds.length - 1]].map(nodeLabel);
        return (
          <li key={`${segment.companyId}-${segment.layer}-${index}`}>
            <strong>{companyName(companies, segment.companyId)}</strong> carries {ends[0]} to {ends[1]} (
            {LAYER_LABELS[segment.layer] ?? segment.layer}, {segment.lengthKm.toLocaleString('en-US')} km,{' '}
            {formatLatency(segment.latencyMs)})
          </li>
        );
      })}
    </ol>
  );
}

import type { Offer } from '../../api/types';
import { SERVICE_CLASS_LABELS, TIER_LABELS } from '../../content/labels';
import type { CompanyMap } from './providers';

export interface OfferItemProps {
  offer: Offer;
  companies: CompanyMap;
  scale: { min: number; max: number };
  from: string;
  to: string;
  compared: boolean;
  compareFull: boolean;
  detailsOpen: boolean;
  onToggleCompare: () => void;
  onToggleDetails: () => void;
  onShowRoute: () => void;
  onRequest: () => void;
}

export const classLabel = (offer: Offer): string =>
  `${SERVICE_CLASS_LABELS[offer.serviceClass]}, ${offer.throughput} gigaquads/s`;
export const tierLabel = (offer: Offer): string => TIER_LABELS[offer.resilienceTier];
export const conjunctionShort = (offer: Offer): string =>
  offer.conjunction === 'rerouted' ? 'Reroutes through conjunction' : 'Degraded in conjunction';
export const routeShort = (offer: Offer): string =>
  `${offer.hops} hops, ${offer.handoffs} ${offer.handoffs === 1 ? 'handoff' : 'handoffs'}`;

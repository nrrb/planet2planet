import type { Offer } from '../../api/types';
import { ENVIRONMENT_LABELS, SECTOR_LABELS, SERVICE_CLASS_LABELS, TIER_LABELS } from '../../content/labels';
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

export const classLabel = (offer: Offer): string => SERVICE_CLASS_LABELS[offer.serviceClass];
export const tierLabel = (offer: Offer): string => TIER_LABELS[offer.resilienceTier];
export const conjunctionShort = (offer: Offer): string => (offer.conjunction === 'rerouted' ? 'Reroutes' : 'Degrades');
export const conjunctionLong = (offer: Offer): string =>
  offer.conjunction === 'rerouted'
    ? 'Reroutes through solar conjunction and stays up'
    : 'Service degrades during solar conjunction';
export const routeShort = (offer: Offer): string =>
  `${offer.hops} hops, ${offer.handoffs} ${offer.handoffs === 1 ? 'handoff' : 'handoffs'}`;
export const hardeningText = (offer: Offer): string =>
  offer.environments.length ? offer.environments.map((e) => ENVIRONMENT_LABELS[e] ?? e).join(', ') : 'None';
export const sectorText = (offer: Offer): string => offer.sectors.map((s) => SECTOR_LABELS[s] ?? s).join(', ');

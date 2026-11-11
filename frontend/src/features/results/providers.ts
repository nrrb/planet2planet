import type { Company, Offer } from '../../api/types';

export type CompanyMap = ReadonlyMap<string, Company>;

export const companyMap = (companies: Company[] | undefined): CompanyMap =>
  new Map((companies ?? []).map((company) => [company.id, company]));

export const companyName = (companies: CompanyMap, id: string): string => companies.get(id)?.name ?? id;

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The lead provider, with ownership and partners where they apply. */
export function providerLine(offer: Offer, companies: CompanyMap): string {
  let line = companyName(companies, offer.leadCompanyId);
  if (offer.ownerId) line += `, a division of ${companyName(companies, offer.ownerId)}`;
  if (offer.partnerIds.length) {
    line += ` with ${joinNames(offer.partnerIds.map((id) => companyName(companies, id)))}`;
  }
  return line;
}

/** The shared latency scale for a set of offers, so their bars can be compared. */
export function latencyScale(offers: Offer[]): { min: number; max: number } {
  if (!offers.length) return { min: 0, max: 1 };
  const lows = offers.map((o) => o.latencyMs.min);
  const highs = offers.map((o) => o.latencyMs.max);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  return { min: Math.max(0, min - (max - min) * 0.1), max };
}

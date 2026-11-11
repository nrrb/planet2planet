import { describe, expect, it } from 'vitest';
import type { Company, Offer } from '../../api/types';
import { companyMap, latencyScale, providerLine } from './providers';

const company = (id: string, name: string) => ({ id, name }) as Company;
const COMPANIES = companyMap([
  company('a', 'Ares Interplanetary'),
  company('b', 'Cassini Link'),
  company('c', 'Terran Transit'),
  company('d', 'Ligeia Access'),
]);
const offer = (patch: Partial<Offer>) => ({ leadCompanyId: 'a', ownerId: null, partnerIds: [], ...patch }) as Offer;
const range = (min: number, max: number) => ({ latencyMs: { now: min, min, max } }) as Offer;

describe('providerLine', () => {
  it('names only the lead when there is nothing else', () => {
    expect(providerLine(offer({}), COMPANIES)).toBe('Ares Interplanetary');
  });

  it('says when the lead is a division, and lists partners', () => {
    expect(providerLine(offer({ ownerId: 'c' }), COMPANIES)).toBe('Ares Interplanetary, a division of Terran Transit');
    expect(providerLine(offer({ partnerIds: ['b'] }), COMPANIES)).toBe('Ares Interplanetary with Cassini Link');
    expect(providerLine(offer({ partnerIds: ['b', 'd'] }), COMPANIES)).toBe(
      'Ares Interplanetary with Cassini Link and Ligeia Access',
    );
  });

  it('falls back to the id for an unknown company', () => {
    expect(providerLine(offer({ leadCompanyId: 'zzz' }), COMPANIES)).toBe('zzz');
  });
});

describe('latencyScale', () => {
  it('spans every offer with a little headroom, never below zero', () => {
    const scale = latencyScale([range(70, 85), range(72, 90)]);
    expect(scale.max).toBe(90);
    expect(scale.min).toBeLessThan(70);
    expect(scale.min).toBeGreaterThanOrEqual(0);
    expect(latencyScale([])).toEqual({ min: 0, max: 1 });
  });
});

/**
 * The price formula. Pure functions over a parameter mapping.
 *
 *     segment cost  = base x throughput factor x class factor x provider positioning
 *     transit cost  = sum over backbone hops of per-hop rate x hop length factor
 *     handoff fees  = handoff fee x carrier changes (waived inside a corporate family)
 *     subtotal      = segments + transit + handoffs
 *     monthly price = subtotal x market x environment x resilience x family x term
 *
 * Every step is a breakdown line. Lines are whole credits taken from rounded running totals, so
 * they always add up to the rounded price. All numbers are invented, not canon.
 */

import { pyRound } from './util';

export type Params = Readonly<Record<string, number>>;

export interface Segment {
  label: string;
  monthlyBase: number;
  throughput: number;
  serviceClass: string;
  positioning: number;
  setupFee?: number;
}

export interface Line {
  label: string;
  credits: number;
}

export interface Price {
  monthly: number;
  setup: number;
  breakdown: Line[];
  terms: Record<string, number>;
  currency: 'credits';
}

export const throughputFactor = (p: Params, throughput: number): number =>
  (throughput / p['throughput.reference']) ** p['throughput.exponent'];

/** From the single-carrier premium down to the floor at five or more carriers. */
export function competitionFactor(p: Params, independentCarriers: number): number {
  const high = p['competition.max'];
  const low = p['competition.min'];
  const floorAt = p['competition.floor_at'];
  const carriers = Math.min(Math.max(independentCarriers, 1), floorAt);
  return high - ((high - low) * (carriers - 1)) / (floorAt - 1);
}

/** Driven by the smaller known population of the two ends (Earth's is not modelled). */
export function marketSizeFactor(p: Params, populations: (number | null)[]): number {
  const known = populations.filter((x): x is number => x !== null);
  if (known.length === 0) return p['market.large_factor'];
  const smallest = Math.min(...known);
  if (smallest < p['market.tiny_population']) return p['market.tiny_factor'];
  if (smallest < p['market.small_population']) return p['market.small_factor'];
  if (smallest < p['market.mid_population']) return p['market.mid_factor'];
  return p['market.large_factor'];
}

export const segmentCost = (p: Params, s: Segment): number =>
  s.monthlyBase * throughputFactor(p, s.throughput) * p[`class.${s.serviceClass}`] * s.positioning;

export const hopCost = (p: Params, lengthAu: number): number =>
  p['transit.per_hop_rate'] * (1 + p['transit.length_coefficient'] * Math.log1p(lengthAu));

export interface PriceInput {
  segments: Segment[];
  hopLengthsAu: number[];
  handoffs: number;
  family: boolean;
  leadPositioning: number;
  independentCarriers: number;
  populations: (number | null)[];
  requiredEnvironments: Iterable<string>;
  tier: string;
  reroute: boolean;
  contractTerms: Readonly<Record<string, number>>;
}

export function priceOffer(p: Params, input: PriceInput): Price {
  const steps: [string, number][] = input.segments.map((s) => [s.label, segmentCost(p, s)]);
  if (input.hopLengthsAu.length > 0) {
    const transit = input.hopLengthsAu.reduce((sum, length) => sum + hopCost(p, length), 0) * input.leadPositioning;
    const hops = input.hopLengthsAu.length;
    steps.push([`Transit, ${hops} backbone hop${hops !== 1 ? 's' : ''}`, transit]);
  }
  if (input.handoffs && !input.family) {
    steps.push([`Carrier handoffs (${input.handoffs})`, p['handoff.fee'] * input.handoffs]);
  }

  const multipliers: [string, number][] = [
    ['Market adjustment', competitionFactor(p, input.independentCarriers) * marketSizeFactor(p, input.populations)],
  ];
  const environments = [...new Set(input.requiredEnvironments)].sort();
  if (environments.length > 0) {
    const surcharge = environments.reduce((sum, e) => sum + p[`environment.${e}`], 0);
    multipliers.push([`Environment surcharge (${environments.join(', ')})`, 1 + surcharge]);
  }
  const resilience = p[`resilience.${input.tier}`] + (input.reroute ? p['resilience.reroute_fee'] : 0);
  if (resilience !== 1) {
    multipliers.push([
      `Resilience: ${input.tier.replaceAll('-', ' ')}${input.reroute ? ' with rerouting' : ''}`,
      resilience,
    ]);
  }
  if (input.family) multipliers.push(['Corporate family discount', 1 - p['family.discount']]);

  const lines: Line[] = [];
  let cumulative = 0;
  let previous = 0;
  for (const [label, amount] of steps) {
    cumulative += amount;
    lines.push({ label, credits: pyRound(cumulative) - previous });
    previous = pyRound(cumulative);
  }
  for (const [label, factor] of multipliers) {
    cumulative *= factor;
    if (pyRound(cumulative) - previous || label === 'Market adjustment') {
      lines.push({ label, credits: pyRound(cumulative) - previous });
      previous = pyRound(cumulative);
    }
  }

  const terms: Record<string, number> = {};
  for (const [term, multiplier] of Object.entries(input.contractTerms)) {
    terms[term] = pyRound(cumulative * multiplier);
  }
  const setup = pyRound(input.segments.reduce((sum, s) => sum + (s.setupFee ?? 0) * s.positioning, 0));
  return { monthly: pyRound(cumulative), setup, breakdown: lines, terms, currency: 'credits' };
}

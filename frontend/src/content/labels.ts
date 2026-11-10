/** UI labels, kept in one place so they can be translated later. */
import type { ResilienceTier, ServiceClass } from '../api/types';

export const SERVICE_CLASS_LABELS: Record<ServiceClass, string> = {
  shared: 'Shared',
  dedicated: 'Dedicated',
  synchronized: 'Synchronized',
};

export const SERVICE_CLASS_HINTS: Record<ServiceClass, string> = {
  shared: 'Best effort over a shared channel',
  dedicated: 'A guaranteed channel',
  synchronized: 'Timing-grade, for clearing and control',
};

export const TIER_LABELS: Record<ResilienceTier, string> = {
  standard: 'Standard',
  'diverse-path': 'Diverse path',
  hardened: 'Hardened',
  contingency: 'Contingency',
  'terraforming-zone': 'Terraforming-zone protection',
};

export const SECTOR_LABELS: Record<string, string> = {
  science: 'Scientific',
  commercial: 'Commercial',
  industrial: 'Industrial',
};

export const KIND_LABELS: Record<string, string> = {
  backbone: 'Backbone',
  regional: 'Regional carrier',
  gateway: 'Local gateway',
  specialist: 'Specialist',
};

export const ENVIRONMENT_LABELS: Record<string, string> = {
  radiation: 'Radiation',
  cryogenic: 'Cryogenic',
  solar: 'Solar',
  'gas-giant-orbit': 'Gas-giant orbit',
};

export const LAYER_LABELS: Record<string, string> = {
  access: 'Access',
  mesh: 'Regional mesh',
  backbone: 'Backbone',
  cross: 'Cross-link',
  conjunction: 'Conjunction reroute',
};

export const BADGE_LABELS: Record<string, string> = {
  'lowest-price': 'Lowest price',
  'lowest-latency': 'Lowest latency',
  'most-resilient': 'Most resilient',
};

export const SORT_LABELS = {
  price: 'Monthly price',
  latency: 'Latency today',
  'worst-latency': 'Worst-case latency',
  tier: 'Redundancy tier',
} as const;
export type SortKey = keyof typeof SORT_LABELS;

export const CONJUNCTION_LABELS = {
  rerouted: 'Rerouted: stays up through solar conjunction',
  degraded: 'Degraded: reduced throughput during conjunction',
} as const;

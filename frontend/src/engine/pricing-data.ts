/** The shape of data/pricing.json: invented pricing inputs, kept as data so they can be edited. */

export interface PlanTemplate {
  code: string;
  name: string;
  serviceClass: string;
  throughput: number;
  monthlyBase: number;
  setupFee: number;
  resilienceTier: string;
  conjunctionReroute: boolean;
  standalone: boolean;
  role: string;
}

/** Specialist plans carry no reroute or standalone flag: they never reroute, and add-ons are not standalone. */
export type SpecialistTemplate = Omit<PlanTemplate, 'conjunctionReroute' | 'standalone'>;

export interface PricingData {
  note: string;
  parameters: Record<string, number>;
  termDiscounts: Record<string, number>;
  /** Plan templates by company kind. */
  templates: Record<string, PlanTemplate[]>;
  /** Plans for individual specialist companies, by company id. */
  specialistPlans: Record<string, SpecialistTemplate[]>;
  /** Each active company's price positioning: 0.85 cheap to 1.25 premium (older companies cost more). */
  positioning: Record<string, number>;
}

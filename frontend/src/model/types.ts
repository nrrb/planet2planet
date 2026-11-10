export interface Orbit {
  radiusKm: number;
  periodDays: number;
  angleRad: number;
  direction: 1 | -1;
  epoch: string;
}
export interface Body {
  id: string;
  name: string;
  parentId: string | null;
  horizonsId: string;
  radiusKm: number;
  color: string;
  sources: string[];
  orbit?: Orbit;
}
export interface Catalog {
  generatedAt: string;
  epoch: string;
  frame: string;
  units: { distance: string; period: string; angle: string; time: string };
  referenceKind: 'illustrative' | 'horizons';
  provenance: string;
  bodies: Body[];
}
export interface Point { x: number; y: number }
export interface Selection { origin: string | null; destination: string | null }

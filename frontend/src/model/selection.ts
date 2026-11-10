import type { Selection } from './types';
export const EMPTY: Selection = { origin: null, destination: null };
export type SelectionAction = { type: 'click' | 'origin' | 'destination'; id: string } | { type: 'clear' };
export function select(state: Selection, action: SelectionAction): Selection {
  if (action.type === 'clear') return EMPTY;
  const id = action.id || null;
  if (action.type === 'origin') return { origin: id, destination: null };
  if (action.type === 'destination') return { ...state, destination: state.origin && id !== state.origin ? id : null };
  if (!state.origin || state.destination) return { origin: id, destination: null };
  return id === state.origin ? state : { ...state, destination: id };
}

import type { NetworkFilters } from '../../map/adapter';

const list = (value: string | null): string[] => (value ? value.split(',').filter(Boolean) : []);

/** Filters live in the URL hash (/about#network&layer=backbone) so a view can be shared. */
export function parseNetworkHash(hash: string): NetworkFilters {
  const params = new URLSearchParams(hash.replace(/^#/, '').replace(/^network&?/, ''));
  return {
    layers: list(params.get('layer')),
    kinds: list(params.get('kind')),
    providers: list(params.get('provider')),
    region: params.get('region'),
  };
}

export function networkHash(filters: NetworkFilters): string {
  const params = new URLSearchParams();
  if (filters.layers.length) params.set('layer', filters.layers.join(','));
  if (filters.kinds.length) params.set('kind', filters.kinds.join(','));
  if (filters.providers.length) params.set('provider', filters.providers.join(','));
  if (filters.region) params.set('region', filters.region);
  const rest = params.toString();
  return rest ? `#network&${rest}` : '#network';
}

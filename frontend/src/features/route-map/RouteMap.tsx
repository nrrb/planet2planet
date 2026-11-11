import { lazy, Suspense, useMemo } from 'react';
import { useCompanies, useNetwork, useWorlds } from '../../api/hooks';
import type { Offer } from '../../api/types';
import { buildMapModel, routeRenderLinks } from '../../map/adapter';

const MapView = lazy(() => import('../../map/MapView'));

interface Props {
  offer: Offer;
  from: string;
  to: string;
}

/** The chosen offer's route on the map: both worlds lit, every other world faint. */
export function RouteMap({ offer, from, to }: Props) {
  const worlds = useWorlds();
  const network = useNetwork();
  const companies = useCompanies();

  const model = useMemo(
    () => (worlds.data && network.data ? buildMapModel(worlds.data, network.data) : null),
    [worlds.data, network.data],
  );
  const links = useMemo(() => {
    if (!model) return [];
    const byId = new Map((companies.data ?? []).map((c) => [c.id, c]));
    return routeRenderLinks(model, offer, byId);
  }, [model, offer, companies.data]);
  const highlighted = useMemo(() => new Set([from, to]), [from, to]);
  const fitNodes = useMemo(() => [...new Set(offer.segments.flatMap((s) => s.nodeIds))], [offer]);

  if (network.error || worlds.error) {
    return <p role="alert">The map data could not be loaded. The route is listed below.</p>;
  }
  if (!model) return <p role="status">Loading the map…</p>;
  return (
    <Suspense fallback={<p role="status">Loading the map…</p>}>
      <MapView
        model={model}
        links={links}
        highlighted={highlighted}
        dimOthers
        labelPlanets={false}
        fitNodes={fitNodes}
        label={`Map of the route for ${offer.title}`}
      />
    </Suspense>
  );
}

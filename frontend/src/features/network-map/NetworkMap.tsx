import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompanies, useNetwork, useRegions, useWorlds } from '../../api/hooks';
import type { Company } from '../../api/types';
import { KIND_LABELS } from '../../content/labels';
import { buildMapModel, EMPTY_FILTERS, networkRenderLinks } from '../../map/adapter';
import { LAYER_ORDER, LAYER_STYLES } from '../../map/palette';
import { networkHash, parseNetworkHash } from './networkHash';
import styles from './NetworkMap.module.css';

const MapView = lazy(() => import('../../map/MapView'));

const toggle = (list: readonly string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function Profile({
  company,
  companies,
  worldName,
}: {
  company: Company;
  companies: Company[];
  worldName: (id: string) => string;
}) {
  const name = (id: string | null) => companies.find((c) => c.id === id)?.name ?? id;
  const divisions = companies.filter((c) => c.owner === company.id);
  return (
    <section className={styles.profile} aria-label={`${company.name} profile`}>
      <h3>{company.name}</h3>
      <p>{company.focus}</p>
      <dl>
        <dt>Kind</dt>
        <dd>{KIND_LABELS[company.kind] ?? company.kind}</dd>
        <dt>Founded</dt>
        <dd>{company.founded}</dd>
        <dt>Headquarters</dt>
        <dd>{worldName(company.headquarters)}</dd>
        {company.parent && (
          <>
            <dt>Spun off from</dt>
            <dd>{name(company.parent)}</dd>
          </>
        )}
        {company.owner && (
          <>
            <dt>Owned by</dt>
            <dd>{name(company.owner)}</dd>
          </>
        )}
        {divisions.length > 0 && (
          <>
            <dt>Divisions</dt>
            <dd>{divisions.map((d) => d.name).join(', ')}</dd>
          </>
        )}
        <dt>Serves</dt>
        <dd>{company.worldIds.map(worldName).join(', ')}</dd>
      </dl>
    </section>
  );
}

/** Every link in the system, with filters. Choosing providers lights theirs and dims the rest. */
export function NetworkMap() {
  const location = useLocation();
  const navigate = useNavigate();
  const worlds = useWorlds();
  const network = useNetwork();
  const companies = useCompanies();
  const regions = useRegions();
  const [search, setSearch] = useState('');
  const searchId = useId();
  const regionId = useId();

  const filters = useMemo(() => parseNetworkHash(location.hash), [location.hash]);
  // The unfiltered system is dense, so a first visit starts on the four backbones.
  useEffect(() => {
    if (location.hash === '') {
      void navigate(
        { hash: networkHash({ ...EMPTY_FILTERS, kinds: ['backbone'] }) },
        { replace: true, preventScrollReset: true },
      );
    }
    // only on first show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setFilters = (next: typeof filters): void =>
    void navigate({ hash: networkHash(next) }, { replace: true, preventScrollReset: true });

  const model = useMemo(
    () => (worlds.data && network.data ? buildMapModel(worlds.data, network.data) : null),
    [worlds.data, network.data],
  );
  const companyById = useMemo(() => new Map((companies.data ?? []).map((c) => [c.id, c])), [companies.data]);
  const links = useMemo(
    () => (model ? networkRenderLinks(model, companyById, filters) : []),
    [model, companyById, filters],
  );
  const trading = useMemo(
    () => (companies.data ?? []).filter((c) => c.status !== 'merged' && c.worldIds.length > 0),
    [companies.data],
  );
  const selected = trading.filter((c) => filters.providers.includes(c.id));
  const highlighted = useMemo(() => new Set(selected.flatMap((c) => c.worldIds)), [selected]);
  // Frame the chosen providers' coverage; with none chosen, the whole system.
  const fitNodes = useMemo(
    () => (selected.length ? [...new Set(selected.flatMap((c) => c.worldIds.map((w) => `c-${w}`)))] : null),
    [selected],
  );
  const worldName = (id: string) => worlds.data?.find((w) => w.id === id)?.name ?? id;
  const visible = trading.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const kinds = Object.keys(KIND_LABELS);
  const anyFilter =
    filters.layers.length + filters.kinds.length + filters.providers.length > 0 || filters.region !== null;

  if (network.error || worlds.error)
    return <p role="alert">The network could not be loaded. Try reloading the page.</p>;
  if (!model) return <p role="status">Loading the network…</p>;

  return (
    <div className={styles.wrap}>
      <form className={styles.controls} aria-label="Network filters" onSubmit={(e) => e.preventDefault()}>
        <fieldset className={styles.group}>
          <legend>Layers</legend>
          {LAYER_ORDER.map((layer) => (
            <label key={layer} className={styles.option}>
              <input
                type="checkbox"
                checked={filters.layers.includes(layer)}
                onChange={() => setFilters({ ...filters, layers: toggle(filters.layers, layer) })}
              />
              {LAYER_STYLES[layer].label}
            </label>
          ))}
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Provider kind</legend>
          {kinds.map((kind) => (
            <label key={kind} className={styles.option}>
              <input
                type="checkbox"
                checked={filters.kinds.includes(kind)}
                onChange={() => setFilters({ ...filters, kinds: toggle(filters.kinds, kind) })}
              />
              {KIND_LABELS[kind]}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor={regionId} style={{ fontWeight: 650, display: 'block', marginBottom: 4 }}>
            Region
          </label>
          <select
            id={regionId}
            className={styles.select}
            value={filters.region ?? ''}
            onChange={(e) => setFilters({ ...filters, region: e.target.value || null })}
          >
            <option value="">All regions</option>
            {(regions.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={searchId} style={{ fontWeight: 650, display: 'block', marginBottom: 4 }}>
            Providers
          </label>
          <input
            id={searchId}
            className={styles.search}
            type="search"
            placeholder="Search providers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {selected.length > 0 && (
            <div className={styles.chips}>
              {selected.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.chip}
                  onClick={() => setFilters({ ...filters, providers: toggle(filters.providers, c.id) })}
                  aria-label={`Remove ${c.name}`}
                >
                  {c.name} ×
                </button>
              ))}
            </div>
          )}
          <div className={styles.providerList} role="group" aria-label="Providers">
            {visible.length === 0 && <p style={{ padding: '8px 0' }}>No provider matches that search.</p>}
            {visible.map((c) => (
              <label key={c.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={filters.providers.includes(c.id)}
                  onChange={() => setFilters({ ...filters, providers: toggle(filters.providers, c.id) })}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={styles.reset}
          disabled={!anyFilter}
          onClick={() => setFilters({ layers: [], kinds: [], providers: [], region: null })}
        >
          Reset filters
        </button>
      </form>
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <p role="status" aria-live="polite" className="visually-hidden">
          Showing {links.length} links
        </p>
        <Suspense fallback={<p role="status">Loading the map…</p>}>
          <MapView
            model={model}
            links={links}
            highlighted={highlighted}
            dimOthers={filters.providers.length > 0}
            labelPlanets
            fitNodes={fitNodes}
            label="Map of Sol's subspace network"
          />
        </Suspense>
        {selected.map((c) => (
          <Profile key={c.id} company={c} companies={companies.data ?? []} worldName={worldName} />
        ))}
        <details>
          <summary
            style={{
              minHeight: 'var(--tap)',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Show the providers as a table
          </summary>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">Providers trading in 2380</caption>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Founded</th>
                  <th scope="col">Worlds served</th>
                </tr>
              </thead>
              <tbody>
                {trading.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.name}</th>
                    <td>{KIND_LABELS[c.kind] ?? c.kind}</td>
                    <td>{c.founded}</td>
                    <td>{c.worldIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

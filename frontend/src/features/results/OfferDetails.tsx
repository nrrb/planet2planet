import { useCompanies, useWorldDetail } from '../../api/hooks';
import type { Offer } from '../../api/types';
import { formatCredits } from '../../ui/format';
import { type CompanyMap, companyMap, companyName } from './providers';
import { SegmentList } from './SegmentList';
import { useNodeLabel } from './useNodeLabel';
import styles from './Results.module.css';

interface Props {
  offer: Offer;
  from: string;
  to: string;
  id: string;
}

function Lineage({ offer, companies }: { offer: Offer; companies: CompanyMap }) {
  const ids = [offer.leadCompanyId, ...offer.partnerIds];
  return (
    <ul>
      {ids.map((id) => {
        const company = companies.get(id);
        if (!company) return <li key={id}>{id}</li>;
        const parts = [`founded ${company.founded}`];
        if (company.parent) parts.push(`spun off from ${companyName(companies, company.parent)}`);
        if (company.owner) parts.push(`a division of ${companyName(companies, company.owner)}`);
        return (
          <li key={id}>
            <strong>{company.name}</strong>: {parts.join(', ')}
          </li>
        );
      })}
    </ul>
  );
}

function CanonNotes({ worldId }: { worldId: string }) {
  const { data } = useWorldDetail(worldId);
  if (!data) return null;
  return (
    <div>
      <h4 style={{ margin: '4px 0 2px' }}>{data.name}</h4>
      {data.canonNotes.length ? (
        <ul>
          {data.canonNotes.map((note, index) => (
            <li key={index}>
              {note.year ? `${note.year}: ` : ''}
              {note.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>No canon notes for this world.</p>
      )}
    </div>
  );
}

export function OfferDetails({ offer, from, to, id }: Props) {
  const companies = companyMap(useCompanies().data);
  const nodeLabel = useNodeLabel();
  return (
    <div className={styles.details} id={id}>
      <section>
        <h3>Route, segment by segment</h3>
        <SegmentList segments={offer.segments} companies={companies} nodeLabel={nodeLabel} />
      </section>
      <section>
        <h3>Price breakdown</h3>
        <table>
          <tbody>
            {offer.price.breakdown.map((line) => (
              <tr key={line.label}>
                <td>{line.label}</td>
                <td className="figure">{formatCredits(line.credits)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Monthly total</th>
              <th className="figure">{formatCredits(offer.price.monthly)}</th>
            </tr>
            <tr>
              <td>One-time setup</td>
              <td className="figure">{formatCredits(offer.price.setup)}</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note} style={{ marginTop: 6 }}>
          Monthly by contract term:{' '}
          {Object.entries(offer.price.terms)
            .map(([term, credits]) => `${term.replace('-', ' ')} ${formatCredits(credits)}`)
            .join(', ')}
        </p>
        {offer.addons.length > 0 && (
          <>
            <h4 style={{ margin: '10px 0 2px' }}>Add-ons</h4>
            <ul>
              {offer.addons.map((addon) => (
                <li key={addon.id}>
                  {addon.label}: +{formatCredits(addon.monthly)} a month
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section>
        <h3>Provider lineage</h3>
        <Lineage offer={offer} companies={companies} />
      </section>
      <section>
        <h3>Canon notes for both worlds</h3>
        <CanonNotes worldId={from} />
        <CanonNotes worldId={to} />
      </section>
    </div>
  );
}

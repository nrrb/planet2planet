import { NetworkMap } from '../features/network-map/NetworkMap';

export default function AboutPage() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h1>About Planet2Planet</h1>
        <p style={{ marginTop: 8, maxWidth: '60ch' }}>
          The story of Sol&rsquo;s networks and how subspace works are being written for this page.
        </p>
      </div>
      <section id="network" aria-labelledby="network-heading" style={{ display: 'grid', gap: 12 }}>
        <h2 id="network-heading">The network today</h2>
        <p style={{ maxWidth: '65ch' }}>
          Every link in the system in 2380. Pick a provider to light its coverage and dim the rest.
        </p>
        <NetworkMap />
      </section>
    </div>
  );
}

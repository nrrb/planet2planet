import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SolarSystemMap } from './components/SolarSystemMap';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="demo-shell">
      <header className="site-header">
        <a className="brand" href="./" aria-label="Planet2Planet home">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          planet<span className="brand-two">2</span>planet<span className="brand-period">.</span>
        </a>
        <span className="header-tag">INTERPLANETARY / EXPLORER</span>
        <span className="catalog-badge">
          <i />
          30 worlds. One system.
        </span>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">A CONNECTION BEYOND EARTH</p>
            <h1>Space between us.</h1>
          </div>
          <p>
            Explore the neighborhood.
            <br />
            Choose two worlds. Make a connection.
          </p>
        </div>
        <SolarSystemMap />
      </main>
      <footer>
        <span>
          PLANET2PLANET <span className="footer-slash">/</span> SOLAR NETWORK DEMO
        </span>
        <span>Signals are visual effects · No physical delay calculation</span>
      </footer>
    </div>
  </StrictMode>,
);

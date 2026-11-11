import { Link, NavLink, Outlet } from 'react-router-dom';
import { AUTHOR, SOURCE_URL } from '../config';
import { useTheme } from './theme';
import styles from './Layout.module.css';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <circle cx="6" cy="19" r="4" fill="currentColor" />
      <circle cx="22" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14C12 5 17 4 19.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Compare', end: true },
  { to: '/about', label: 'About', end: false },
  { to: '/canon', label: 'Canon', end: false },
];

export function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link to="/" className={styles.brand}>
            <Logo />
            Planet2Planet
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <ul>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className={styles.link}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            className={styles.themeButton}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>
            Planet2Planet is unofficial fan work set in the Star Trek universe. It is not affiliated with or endorsed by
            Paramount or any Star Trek rights holder, and it uses no Star Trek logos, insignia, images or interface
            designs. Plans, prices and companies are invented.
          </p>
          <p>
            <Link to="/canon">How this setting was built</Link>
          </p>
          <p>
            Built with love{' '}
            <span role="img" aria-label="Vulcan salute">
              🖖🏻
            </span>{' '}
            by{' '}
            <a href={AUTHOR.url} target="_blank" rel="noreferrer">
              {AUTHOR.name}
              <span className="visually-hidden"> (author&rsquo;s website, opens in a new tab)</span>
            </a>
            .{' '}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              Source on GitHub
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}

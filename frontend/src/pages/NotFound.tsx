import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p style={{ margin: '8px 0 16px' }}>There is nothing at this address.</p>
      <Link to="/">Compare plans</Link>
    </div>
  );
}

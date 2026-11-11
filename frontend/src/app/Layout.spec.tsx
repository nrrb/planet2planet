import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';

describe('Layout footer', () => {
  it('credits the author, links to their website and to the source, and opens both in a new tab', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/Built with love/);
    expect(within(footer).getByRole('img', { name: 'Live long, and prosper.' })).toBeInTheDocument();

    const author = within(footer).getByRole('link', { name: /Nicholas Bennett/ });
    expect(author).toHaveAttribute('href', 'https://nicholasbennett.work/');
    expect(author).toHaveAttribute('target', '_blank');
    expect(author).toHaveAttribute('rel', expect.stringContaining('noreferrer'));

    const source = within(footer).getByRole('link', { name: /Source on GitHub/ });
    expect(source).toHaveAttribute('href', 'https://github.com/nrrb/planet2planet');
    expect(source).toHaveAttribute('target', '_blank');
  });
});

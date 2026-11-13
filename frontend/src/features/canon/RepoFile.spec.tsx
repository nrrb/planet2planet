import { render, screen } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_FILES } from '../../config';
import { RepoFileLink } from './RepoFile';
import { ScriptLink } from './ScriptLink';

const BASE = 'https://github.com/example/planet2planet';
const COMMIT = '1f948fb3fd73d8779f4dc754193b7db753337775';
const REPO_ROOT = resolve(__dirname, '../../../..');

describe('files the site links to in the repository', () => {
  it.each(Object.entries(REPO_FILES))('%s exists in the repository', (_name, path) => {
    expect(existsSync(resolve(REPO_ROOT, path)), `${path} is linked but missing`).toBe(true);
  });

  it('links data and documents on main, because exports are committed after the script that made them', () => {
    render(
      <RepoFileLink path={REPO_FILES.monteCarlo} base={BASE}>
        The Monte Carlo summary
      </RepoFileLink>,
    );
    const link = screen.getByRole('link', { name: /The Monte Carlo summary/ });
    expect(link).toHaveAttribute('href', `${BASE}/blob/main/data/sol-montecarlo-2380.json`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('pins only the script to the commit that produced the data', () => {
    render(<ScriptLink commit={COMMIT} base={BASE} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', `${BASE}/blob/${COMMIT}/${REPO_FILES.script}`);
  });

  it('shows plain text when no repository is configured', () => {
    render(
      <RepoFileLink path={REPO_FILES.derivation} base={null}>
        The derivation document
      </RepoFileLink>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('The derivation document')).toBeInTheDocument();
  });
});

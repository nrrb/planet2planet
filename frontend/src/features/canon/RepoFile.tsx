import type { ReactNode } from 'react';
import { REPO_URL, repoLink } from '../../config';

/** A link to a file in the repository on main, in a new tab. Plain text when no repository is configured. */
export function RepoFileLink({
  path,
  children,
  base = REPO_URL,
}: {
  path: string;
  children: ReactNode;
  /** The repository URL; defaults to VITE_REPO_URL. Null shows plain text. */
  base?: string | null;
}) {
  const url = repoLink(path, undefined, base);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {children} <span className="visually-hidden">(opens in a new tab)</span>
    </a>
  ) : (
    <span>{children}</span>
  );
}

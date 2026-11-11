import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Keeps one broken page from taking the whole app down. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ padding: '32px var(--gutter)' }}>
        <h1>Something went wrong on this page</h1>
        <p style={{ margin: '8px 0 16px' }}>
          Reload the page to try again. Your selections are kept in the address bar.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}

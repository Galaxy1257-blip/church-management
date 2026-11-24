'use client';
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container">
          <div className="card">
            <h1>Something went wrong on this screen</h1>
            <p className="muted">Reload the page. If it keeps happening, tell the church office what you were doing.</p>
            <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

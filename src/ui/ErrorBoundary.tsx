// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { log } from '../lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-wide error boundary. A thrown render error in any view would otherwise
 * unmount the whole React tree and leave a blank window (React 19). This catches
 * it, logs it to the rotating log file via `log.error`, and shows a recoverable
 * fallback with "Try again" (re-mount the subtree) and "Reload" (restart the
 * WebView) instead. Mounted once above the router in App.tsx.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('Uncaught render error', error, info.componentStack ?? '')
  }

  private reset = () => this.setState({ error: null })

  private reload = () => window.location.reload()

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-1)',
          background: 'var(--surface)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong</h1>
        <p style={{ color: 'var(--text-2)', maxWidth: '40ch', margin: 0 }}>
          A view crashed unexpectedly. Your notes are safe on disk — try again, or
          reload the app.
        </p>
        <pre
          style={{
            maxWidth: '100%',
            maxHeight: '30vh',
            overflow: 'auto',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'var(--surface-2)',
            color: 'var(--text-3)',
            fontSize: '0.8rem',
            textAlign: 'left',
          }}
        >
          {error.message}
        </pre>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={this.reset} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Try again
          </button>
          <button
            onClick={this.reload}
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: 'var(--accent-contrast, #fff)',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

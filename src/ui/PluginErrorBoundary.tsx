// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { pluginLog } from '../lib/pluginLog'
import { pluginRegistry } from '../lib/pluginRegistry'
import { setPluginEnabledState } from '../lib/pluginEnabled'
import { toast } from '../lib/toast'
import Styles from './PluginErrorBoundary.module.css'

interface Props {
  /** What crashed, in the user's words — a note type's label, a widget's title. */
  name: string
  /** The plugin's id, when the caller knows it; tags the Plugin Console line. */
  pluginId?: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * A boundary around *one* plugin surface (a note-type View/Editor, a tray widget).
 * The app-wide ErrorBoundary would catch these too — but it replaces the entire
 * window, so a third-party bug reads as "Jnana broke". This keeps the blast radius
 * at the thing that actually threw, names it, and logs to the Plugin Console.
 *
 * It holds the error until it's remounted, so callers key it on the registry
 * version (`getNoteTypesVersion` / `getContributionsVersion`) — reloading or
 * re-enabling a plugin then gives its surface a clean try.
 */
export default class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    pluginLog('error', `${this.props.name} crashed: ${error.message}`, this.props.pluginId)
    console.error(`[plugin] ${this.props.name} crashed`, error, info.componentStack ?? '')
  }

  /** Turn the culprit off from here — a crash loop is otherwise a trip to Settings
   *  while the thing keeps throwing. Persisted, so it stays off after a restart. */
  private disable = () => {
    const pluginId = this.props.pluginId
    if (!pluginId) return
    const name = pluginRegistry.get(pluginId)?.name ?? pluginId
    pluginRegistry.unregister(pluginId)
    setPluginEnabledState(pluginId, false)
    toast.success(`Disabled ${name}. Re-enable it in Settings → Plugins.`)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={Styles.crashed} role="alert">
        <div className={Styles.head}>
          <AlertTriangle size={15} /> {this.props.name} stopped working
        </div>
        <p className={Styles.hint}>
          A plugin crashed, not Jnana — your notes are untouched.
        </p>
        <pre className={Styles.detail}>{error.message}</pre>
        {this.props.pluginId && (
          <div>
            <button className={Styles.action} onClick={this.disable}>
              Disable this plugin
            </button>
          </div>
        )}
      </div>
    )
  }
}

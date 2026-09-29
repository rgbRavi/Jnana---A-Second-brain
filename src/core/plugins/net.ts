// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { PluginNetApi, PluginNetResponse } from '../../lib/pluginApi'
import { pluginLog } from '../../lib/pluginLog'
import { guard } from './guard'

// The `network` permission, implemented. A plugin can't reach the internet from
// the WebView (the CSP's default-src stops it), so its requests come through the
// Rust `plugin_fetch` command, which checks — against what the user approved at
// install — that the plugin has the permission at all, and that the host is one
// its manifest declared. https only, 30s timeout, 5 MB response ceiling.
//
// Deliberately not `fetch`: this returns the body as text, in one piece, with no
// streaming, redirect control or cookies. That is what an API call needs and
// nothing more.

/** Build a `PluginNetApi` bound to one plugin id (so callers never pass it). */
export function makePluginNet(pluginId: string): PluginNetApi {
  return {
    request(url, init) {
      return guard(pluginId, 'requests', async () => {
        const res = await invoke<PluginNetResponse>('plugin_fetch', {
          pluginId,
          url,
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
        })
        // Every outbound request is named in the Plugin Console: where it went and
        // what came back. A plugin quietly talking to its server is the thing a
        // user most needs to be able to see.
        let host = url
        try {
          host = new URL(url).host
        } catch {
          /* keep the raw string */
        }
        pluginLog('info', `${(init?.method ?? 'GET').toUpperCase()} ${host} → ${res.status}`, pluginId)
        return res
      })
    },
  }
}

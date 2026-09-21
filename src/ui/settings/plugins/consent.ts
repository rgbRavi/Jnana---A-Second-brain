// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { showConfirmDialog } from '../../../lib/dialog'
import type { PluginManifestPreview } from '../../../core/plugins/loader'

/** Human labels for known permission ids (falls back to the raw id). */
const PERMISSION_LABELS: Record<string, string> = {
  notes: 'Read and modify your notes',
  media: 'Read and add attachments (images, PDFs, audio)',
  network: 'Contact the internet',
}

/** `network` is only ever as wide as the hosts the manifest names, so the prompt
 *  shows them next to the permission instead of leaving "the network" abstract. */
function permissionLine(permission: string, hosts: string[]): string {
  const label = PERMISSION_LABELS[permission] ?? permission
  if (permission !== 'network') return `  • ${label}`
  return hosts.length ? `  • ${label}: ${hosts.join(', ')}` : `  • ${label} (no hosts declared)`
}

/**
 * Install-consent prompt — the trust gate before third-party code is loaded.
 *
 * The copy deliberately does **not** promise that the listed permissions confine
 * the plugin: there is no sandbox, so a plugin runs on the main thread with the
 * app's own access. The list is what the package *declares*, recorded at install
 * (and, for `notes`, what gates its `ctx.notes` API) — not a boundary. Saying so
 * plainly beats a prompt that reads like a permission wall.
 *
 * Resolves `true` when the user accepts; the grant itself is derived Rust-side
 * from the previewed package, never passed from here.
 */
export async function confirmPluginInstall(manifest: PluginManifestPreview): Promise<boolean> {
  const perms = manifest.permissions ?? []
  const sandboxed = manifest.runtime === 'worker'
  const permLines = perms.length
    ? 'It asks to:\n' + perms.map((p) => permissionLine(p, manifest.hosts ?? [])).join('\n')
    : 'It asks for no special capabilities.'

  // The two runtimes deserve genuinely different warnings: one is a boundary, the
  // other is a trust decision. Saying "sandboxed" about the main thread would be a
  // lie, and warning about full access for a worker would be scaremongering.
  const trust = sandboxed
    ? `It runs in Jnana's plugin sandbox: no direct access to your notes, files or the internet — ` +
      `only what it asks for below, answered by Jnana.`
    : `It runs as part of Jnana, with the same access to your notes, files and settings as the app ` +
      `itself. Jnana can't sandbox this kind of plugin, so only install ones you trust.`
  // A package that calls itself a theme has no business reading notes or reaching
  // the internet. `type` is only a label, so it cannot *stop* that — but the
  // person approving the install should have the mismatch pointed out rather than
  // having to spot it in a permission list they were about to skim.
  const typeNote =
    manifest.type !== 'theme'
      ? ''
      : perms.length
        ? `\n\nIt is listed as a theme, but also asks for ${perms.join(' and ')} — a theme does not need that. Install it only if you know why.`
        : '\n\nThis is a theme: it changes how Jnana looks, and asks for nothing else.'
  const source = manifest.homepage ? `\n\nSource: ${manifest.homepage}` : ''

  return showConfirmDialog({
    title: `Install ${manifest.name}?`,
    message:
      `${manifest.name} v${manifest.version}${manifest.author ? ` by ${manifest.author}` : ''}. ` +
      `${trust}\n\n${permLines}${typeNote}${source}`,
    confirmLabel: 'Install',
    danger: !sandboxed,
  })
}

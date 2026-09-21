// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { isNewerVersion, verifyCatalogPackage, type CatalogEntry } from './catalog'
import type { PluginManifestPreview } from './loader'

describe('isNewerVersion', () => {
  it('compares numeric dot-separated versions', () => {
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.0.10', '1.0.2')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false)
  })

  it('handles differing lengths and junk gracefully', () => {
    expect(isNewerVersion('1.2', '1.2.0')).toBe(false)
    expect(isNewerVersion('1.2.1', '1.2')).toBe(true)
    expect(isNewerVersion('v', '')).toBe(false)
  })
})

describe('verifyCatalogPackage', () => {
  const entry: CatalogEntry = {
    id: 'com.acme.tool',
    name: 'Acme Tool',
    version: '1.0.0',
    description: '',
    author: 'acme',
    downloadUrl: 'https://example.com/acme.zip',
    permissions: ['notes'],
    minAppVersion: '0.1.0',
  }
  const pkg = (over: Partial<PluginManifestPreview> = {}): PluginManifestPreview => ({
    id: 'com.acme.tool',
    name: 'Acme Tool',
    version: '1.0.0',
    description: '',
    author: 'acme',
    main: 'dist/main.js',
    minAppVersion: '0.1.0',
    permissions: ['notes'],
    hosts: [],
    homepage: '',
    runtime: 'main',
    type: 'utility',
    consentToken: 'tok',
    sha256: 'abc123',
    ...over,
  })

  it('refuses a package whose type disagrees with the listing', () => {
    // The type is what Browse groups by and what the consent prompt reasons
    // about, so a mismatch is the same class of problem as a runtime mismatch.
    expect(verifyCatalogPackage({ ...entry, type: 'theme' }, pkg())).toMatch(/listed as a theme/)
    expect(verifyCatalogPackage({ ...entry, type: 'theme' }, pkg({ type: 'theme' }))).toBeNull()
    // Omitted on both sides means utility, and must stay silent.
    expect(verifyCatalogPackage(entry, pkg({ type: '' }))).toBeNull()
  })

  it('accepts a package that matches its entry', () => {
    expect(verifyCatalogPackage(entry, pkg())).toBeNull()
    // A hash is only compared when the entry publishes one.
    expect(verifyCatalogPackage({ ...entry, sha256: 'ABC123' }, pkg())).toBeNull()
  })

  it('refuses a package whose id differs from the listing', () => {
    // Would otherwise install over whatever plugin owns that id.
    expect(verifyCatalogPackage(entry, pkg({ id: 'com.jnana.flashcards' }))).toMatch(/doesn't match/)
  })

  it('refuses a download that fails the published checksum', () => {
    expect(verifyCatalogPackage({ ...entry, sha256: 'deadbeef' }, pkg())).toMatch(/checksum/)
  })

  it('refuses a package asking for more than the listing advertised', () => {
    expect(verifyCatalogPackage(entry, pkg({ permissions: ['notes', 'network'] }))).toMatch(/network/)
  })

  it('refuses a package that contacts hosts the listing never mentioned', () => {
    const netEntry = { ...entry, permissions: ['network'], hosts: ['api.acme.com'] }
    const netPkg = pkg({ permissions: ['network'], hosts: ['api.acme.com'] })
    expect(verifyCatalogPackage(netEntry, netPkg)).toBeNull()
    expect(
      verifyCatalogPackage(netEntry, pkg({ permissions: ['network'], hosts: ['api.acme.com', 'evil.tld'] })),
    ).toMatch(/evil\.tld/)
  })

  it('refuses a listing that claims the sandbox but ships a main-thread package', () => {
    // Otherwise the "Sandboxed" badge users choose by would mean nothing.
    expect(verifyCatalogPackage({ ...entry, runtime: 'worker' }, pkg())).toMatch(/sandboxed/)
    expect(verifyCatalogPackage({ ...entry, runtime: 'worker' }, pkg({ runtime: 'worker' }))).toBeNull()
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Rebuild the offline test catalog: zip each sample plugin, hash it, and write
// catalog.json with the real sha256, runtime, hosts and homepage from each
// manifest. Run it from the repo root:
//
//   node examples/sample-catalog/build.mjs
//
// Why this exists: every guard on the install path — checksum, id agreement,
// permission and host agreement, the Sandboxed badge — only runs on a *catalog*
// install. Without a catalog that path is untested, and the curated registry is
// still empty. This one is local, so it exercises the whole flow with no hosting.
//
// Zips are written with the STORE method (no compression) so this stays
// dependency-free; the app reads them the same either way.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const examples = join(here, '..')

/** Every file under `dir`, as paths relative to it, with forward slashes. */
function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full, base)
    return [relative(base, full).split('\\').join('/')]
  })
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Minimal ZIP writer (STORE). Enough for a package of a few small text files. */
function zip(files) {
  const chunks = []
  const central = []
  let offset = 0

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date (1996-01-01, fixed → reproducible)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    chunks.push(local, nameBuf, data)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0, 8)
    entry.writeUInt16LE(0, 10)
    entry.writeUInt16LE(0, 12)
    entry.writeUInt16LE(0x21, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBuf.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBuf)

    offset += local.length + nameBuf.length + data.length
  }

  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, centralBuf, end])
}

const SAMPLES = ['sample-plugin', 'sample-worker-plugin', 'sample-theme']
const entries = []

for (const sample of SAMPLES) {
  const dir = join(examples, sample)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))

  const files = walk(dir)
    // Ship what a real package ships: the manifest and the code it points at.
    .filter((name) => name === 'manifest.json' || name.startsWith('dist/') || name.startsWith('src/'))
    .filter((name) => !name.endsWith('.test.tsx') && !name.endsWith('.test.js'))
    .map((name) => ({ name, data: readFileSync(join(dir, name)) }))

  if (!files.some((f) => f.name === manifest.main)) {
    console.error(`✗ ${sample}: manifest main "${manifest.main}" is not in the package — build it first`)
    process.exit(1)
  }

  const zipName = `${sample}.zip`
  const bytes = zip(files)
  writeFileSync(join(here, zipName), bytes)

  entries.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    author: manifest.author ?? '',
    downloadUrl: join(here, zipName).split('\\').join('/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...(manifest.runtime ? { runtime: manifest.runtime } : {}),
    ...(manifest.type ? { type: manifest.type } : {}),
    ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
    ...(manifest.permissions?.length ? { permissions: manifest.permissions } : {}),
    ...(manifest.hosts?.length ? { hosts: manifest.hosts } : {}),
    minAppVersion: manifest.minAppVersion ?? '0.1.0',
  })

  console.log(`✓ ${zipName} (${files.length} files, ${bytes.length} bytes)`)
}

writeFileSync(join(here, 'catalog.json'), JSON.stringify({ plugins: entries }, null, 2) + '\n')
console.log(`✓ catalog.json (${entries.length} plugins)`)
console.log(`\nBrowse → Catalog URL:\n  ${join(here, 'catalog.json').split('\\').join('/')}`)

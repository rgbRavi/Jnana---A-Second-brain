// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Rust-calling service for user-installed fonts. Files are copied into the assets
// dir (served via jnana-asset://) and grouped into families in data_dir/fonts.json
// — see commands/fonts.rs. This layer is a thin invoke wrapper; face injection and
// the picker live in core/fonts/loadFaces.ts + hooks/useInstalledFonts.ts.

import { invoke } from '@tauri-apps/api/core'

export interface FontFace {
  weight: number
  italic: boolean
  /** Face bytes inlined as a data: URI (built Rust-side). @font-face is a CORS
   *  fetch and Chromium blocks CORS to custom schemes like jnana-asset://, so the
   *  face ships as data: — an allowed scheme — instead of a served file URL. */
  src: string
}

export interface InstalledFont {
  id: string
  family: string
  /** CSS fallback class for the stack: 'sans' | 'serif' | 'mono'. */
  generic: string
  faces: FontFace[]
}

/** Install fonts from picked file paths (font files and/or .zip archives).
 *  Returns the families created or modified by this call. */
export function installFonts(paths: string[]): Promise<InstalledFont[]> {
  return invoke<InstalledFont[]>('install_fonts', { paths })
}

export function listFonts(): Promise<InstalledFont[]> {
  return invoke<InstalledFont[]>('list_fonts')
}

export function removeFont(id: string): Promise<void> {
  return invoke<void>('remove_font', { id })
}

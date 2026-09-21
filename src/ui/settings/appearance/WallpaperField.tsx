// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Settings → Appearance → Design: pick a background image.
//
// The picked file is **copied into the app's assets directory** rather than
// referenced where it sits. A wallpaper that breaks because you tidied your
// Downloads folder is a bad wallpaper, and the copy is also what lets it be
// served over `jnana-asset://` — the scheme the WebView's CSP allows. There is
// no URL field on purpose: a remote image would make every paint an outbound
// request, and it would not load anyway.

import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { ImagePlus, Trash2 } from 'lucide-react'
import { assetUrl, importFile } from '../../../core/notes'
import { toast } from '../../../lib/toast'
import type { UseThemeApi } from '../../../hooks/useTheme'
import { Segmented, SliderField } from './controls'
import styles from './Appearance.module.css'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp']

export function WallpaperField({ api }: { api: UseThemeApi }) {
  const { theme, setWallpaper } = api
  const wallpaper = theme.wallpaper
  const preview = wallpaper?.asset ? assetUrl(wallpaper.asset) : null
  const [busy, setBusy] = useState(false)

  async function choose() {
    setBusy(true)
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
      })
      if (typeof picked !== 'string') return
      const asset = await importFile(picked)
      // Keep whatever the user had already tuned; only the image changes.
      setWallpaper({ fit: 'cover', dim: 0.4, blur: 0, ...(wallpaper ?? {}), asset })
      toast.success('Wallpaper set')
    } catch (err) {
      toast.error('Could not use that image')
      console.error('[WallpaperField] choose failed', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.field}>
      <label>Wallpaper</label>
      {preview && (
        <div
          className={styles.wallpaperPreview}
          style={{ backgroundImage: `url("${preview}")` }}
          role="img"
          aria-label="Current wallpaper"
        />
      )}
      <div className={styles.wallpaperActions}>
        <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void choose()}>
          <ImagePlus size={14} /> {wallpaper?.asset ? 'Change image…' : 'Choose image…'}
        </button>
        {wallpaper?.asset && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setWallpaper(null)
              toast('Wallpaper removed')
            }}
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
      <p className={styles.hint}>
        A picture behind the app. The file is copied into Jnana, so moving or deleting the original
        won&rsquo;t break it. While a wallpaper is set it takes precedence over any backdrop a plugin
        provides.
      </p>

      {wallpaper?.asset && (
        <>
          <div className={styles.field}>
            <label>Fit</label>
            <Segmented
              value={wallpaper.fit ?? 'cover'}
              onChange={(v) => setWallpaper({ ...wallpaper, fit: v })}
              options={[
                { value: 'cover', label: 'Fill' },
                { value: 'contain', label: 'Fit' },
                { value: 'tile', label: 'Tile' },
              ]}
            />
          </div>
          <SliderField
            label="Dim"
            value={Math.round((wallpaper.dim ?? 0.4) * 100)}
            min={0}
            max={100}
            suffix="%"
            hint="Blends the image toward your background colour. This is what keeps text readable over a busy photo — turn it all the way down and contrast is on you."
            onChange={(v) => setWallpaper({ ...wallpaper, dim: v / 100 })}
          />
          <SliderField
            label="Blur"
            value={wallpaper.blur ?? 0}
            min={0}
            max={40}
            suffix="px"
            hint="Softens the image so detail behind text stops competing with it."
            onChange={(v) => setWallpaper({ ...wallpaper, blur: v })}
          />
        </>
      )}
    </div>
  )
}

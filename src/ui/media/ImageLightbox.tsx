// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { AsyncImage } from '../AsyncImage'
import MdStyles from '../editor/MarkdownLite.module.css'

/** Full-viewport image viewer; closes on backdrop click, the × button or Esc.
 *  `url` is a `jnana-asset://<filename>` embed URL or a plain http(s) URL. */
export function ImageLightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEscapeKey(onClose)
  return createPortal(
    <div className={MdStyles.fullscreenOverlay} onClick={onClose}>
      <div className={MdStyles.lightboxContent} onClick={(e) => e.stopPropagation()}>
        <button className={MdStyles.fullscreenClose} onClick={onClose} aria-label="Close"><X size={18} /></button>
        {url.startsWith('jnana-asset://')
          ? <AsyncImage filename={url.replace('jnana-asset://', '')} alt={alt} className={MdStyles.lightboxImage} lazy={false} />
          : <img src={url} alt={alt} className={MdStyles.lightboxImage} />
        }
      </div>
    </div>,
    document.body,
  )
}

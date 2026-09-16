// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef } from 'react'

/** Close an overlay/picker/dialog on Escape. For surfaces that otherwise close
 *  only on an outside mouse click (no keyboard way out). A ref keeps the
 *  listener stable across renders even when `onClose` is an inline arrow. */
export function useEscapeKey(onClose: () => void) {
  const cb = useRef(onClose)
  cb.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

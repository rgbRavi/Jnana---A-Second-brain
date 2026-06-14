// src/hooks/usePresets.ts
import { useCallback, useEffect, useState } from 'react'
import { listPresets, ensureDefaultPresets } from '../core/aiWorkspace'
import type { AiPreset } from '../types'

/** Loads Styles + Skills, seeding built-in defaults on first run. */
export function usePresets() {
  const [styles, setStyles] = useState<AiPreset[]>([])
  const [skills, setSkills] = useState<AiPreset[]>([])

  const refresh = useCallback(async () => {
    const [s, k] = await Promise.all([listPresets('style'), listPresets('skill')])
    setStyles(s)
    setSkills(k)
  }, [])

  useEffect(() => {
    // Seed defaults once, then load.
    Promise.all([ensureDefaultPresets('style'), ensureDefaultPresets('skill')])
      .then(([s, k]) => {
        setStyles(s)
        setSkills(k)
      })
      .catch((e) => console.error('Failed to load AI presets:', e))
  }, [])

  return { styles, skills, refresh }
}

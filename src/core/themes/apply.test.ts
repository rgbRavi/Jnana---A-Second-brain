import { describe, it, expect } from 'vitest'
import { mix, deriveAccent, resolveVars, contrastRatio, contrastGrade, auditContrast } from './apply'
import { themeFromPreset } from './presets'

describe('apply.ts', () => {
  describe('mix', () => {
    it('returns the source at amt 0 and the target at amt 1', () => {
      expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
      expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    })

    it('interpolates the midpoint', () => {
      expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    })
  })

  describe('deriveAccent', () => {
    it('lightens hover/softens toward bg on a dark base', () => {
      const d = deriveAccent('#7c6af7', 'dark')
      // hover mixes 14% toward white — every channel should be >= the source.
      expect(mix('#7c6af7', '#ffffff', 0.14)).toBe(d.hover)
      expect(mix('#7c6af7', '#000000', 0.12)).toBe(d.active)
    })

    it('darkens hover/active toward black on a light base', () => {
      const d = deriveAccent('#6a52e0', 'light')
      expect(mix('#6a52e0', '#000000', 0.14)).toBe(d.hover)
      expect(mix('#6a52e0', '#ffffff', 0.12)).toBe(d.active)
    })
  })

  describe('resolveVars', () => {
    it('adds derived accent vars + density + reading-scale + surface-rgb, without font stacks', () => {
      const theme = themeFromPreset('dark')
      const vars = resolveVars(theme)
      expect(vars['--accent-hover']).toBeDefined()
      expect(vars['--accent-active']).toBeDefined()
      expect(vars['--accent-soft']).toBeDefined()
      expect(vars['--accent-softer']).toBeDefined()
      expect(vars['--density']).toBe('1') // cozy
      expect(vars['--reading-scale']).toBe('1')
      expect(vars['--surface-rgb']).toBe('20, 20, 23') // #141417
      expect(vars['--font-body']).toBeUndefined()
    })
  })

  describe('contrastRatio / contrastGrade', () => {
    it('rates white-on-black at ~21:1 (AAA)', () => {
      const ratio = contrastRatio('#ffffff', '#000000')
      expect(ratio).toBeCloseTo(21, 0)
      expect(contrastGrade(ratio)).toEqual({ tag: 'AAA', ok: true })
    })

    it('rates identical colors at 1:1 (Fail)', () => {
      const ratio = contrastRatio('#7c6af7', '#7c6af7')
      expect(ratio).toBeCloseTo(1, 5)
      expect(contrastGrade(ratio)).toEqual({ tag: 'Fail', ok: false })
    })

    it('grades the WCAG boundaries correctly', () => {
      expect(contrastGrade(7).tag).toBe('AAA')
      expect(contrastGrade(4.5).tag).toBe('AA')
      expect(contrastGrade(3).tag).toBe('AA Large')
      expect(contrastGrade(2.9).tag).toBe('Fail')
    })
  })

  describe('auditContrast', () => {
    it('audits the 5 critical text/surface pairs for the Midnight preset', () => {
      const theme = themeFromPreset('dark')
      const pairs = auditContrast(theme)
      expect(pairs).toHaveLength(5)
      expect(pairs.map((p) => p.label)).toEqual([
        'Primary text on background',
        'Primary text on surface',
        'Secondary text on surface',
        'Muted text on surface',
        'Accent on surface',
      ])
      // Midnight's primary text on background is high-contrast by design.
      const primaryOnBg = pairs[0]
      expect(primaryOnBg.grade.ok).toBe(true)
    })
  })
})

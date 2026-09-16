// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Full-screen first-run wizard. Mounted once in AppLayout next to the other
// global overlays; the launch gate (core/onboarding/gate) decides whether boot
// opens it, and Settings → Developer can open it on demand.

import { useEffect, useMemo, useRef, useState } from 'react'
import { COMFORTS, ROLES, selectSteps, type StepId } from '../../core/onboarding/steps'
import {
  completeOnboarding,
  setOnboarding,
  skipOnboarding,
  useOnboardingOpen,
  useOnboardingState,
} from '../../hooks/useOnboarding'
import { STEP_ART } from './OnboardingArt'
import { COMFORT_COPY, ROLE_COPY, STEP_COPY } from './OnboardingContent'
import styles from './Onboarding.module.css'

export function OnboardingOverlay() {
  const state = useOnboardingState()
  const open = useOnboardingOpen()
  const cardRef = useRef<HTMLDivElement>(null)

  // The deck is recomputed from the answers, so answering the role/comfort
  // questions changes it mid-flow. Track position by StepId, never by index —
  // an index would silently jump the user to an unrelated card.
  const deck = useMemo(() => selectSteps(state.role, state.comfort), [state.role, state.comfort])
  const [currentId, setCurrentId] = useState<StepId>('welcome')

  // Every open starts at the beginning.
  useEffect(() => {
    if (open) setCurrentId('welcome')
  }, [open])

  const rawIndex = deck.indexOf(currentId)
  // A deck change can drop the card we were on (answering "New to this" after
  // seeing the power deck). Fall back to the first card rather than rendering
  // nothing; every deck starts with welcome/role/comfort, so this is never lost
  // progress on the question cards themselves.
  const index = rawIndex === -1 ? 0 : rawIndex
  const stepId = deck[index] ?? 'welcome'
  const isLast = index === deck.length - 1

  const canAdvance =
    stepId === 'role' ? state.role !== null : stepId === 'comfort' ? state.comfort !== null : true

  function next() {
    if (!canAdvance) return
    if (isLast) {
      completeOnboarding()
      return
    }
    setCurrentId(deck[index + 1])
  }

  function back() {
    if (index === 0) return
    setCurrentId(deck[index - 1])
  }

  // Focus trap + keyboard nav. Escape is deliberately NOT a close — leaving is
  // an explicit button, so a reflexive Esc can't drop someone out of the flow.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (e.altKey || e.ctrlKey || e.metaKey) return // e.g. Alt+Left/Right = browser history nav
        e.stopPropagation()
        next()
        return
      }
      if (e.key === 'ArrowLeft') {
        if (e.altKey || e.ctrlKey || e.metaKey) return
        e.stopPropagation()
        back()
        return
      }
      if (e.key === 'Enter') {
        // Only when focus sits on the card itself — a focused button already
        // gets its native Enter-activates-click behaviour, and hijacking that
        // would re-toggle a just-picked answer instead of advancing.
        if (document.activeElement !== cardRef.current) return
        e.stopPropagation()
        e.preventDefault()
        next()
        return
      }
      if (e.key !== 'Tab') return
      e.stopPropagation()
      const root = cardRef.current
      if (!root) return
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    // Capture phase + stopPropagation on every branch we act on: the overlay
    // is visually modal (full-viewport scrim) but window keydown listeners
    // are otherwise all bubble-phase, so without this the command palette
    // (Ctrl/⌘-`) and the canvas board's arrow-key selection nudge both fire
    // invisibly underneath the wizard. Keys we don't handle fall through
    // untouched (see the early returns above).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // No dependency array on purpose: this must always close over the
    // freshest `next`/`back`, which are recreated every render from the
    // current `index`/`deck`. Unlike DialogHost's `[dialog]`-scoped sibling,
    // scoping this effect would trap navigation on a stale card.
  })

  // Return focus to whatever was focused before the wizard took over.
  const restoreRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null
      cardRef.current?.focus()
    } else {
      restoreRef.current?.focus?.()
      restoreRef.current = null
    }
  }, [open])

  if (!open) return null

  const copy = STEP_COPY[stepId]
  const art = STEP_ART[stepId]

  return (
    <div className={styles.overlay} role="presentation">
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Getting started with Jnana"
        tabIndex={-1}
      >
        <div className={styles.dots}>
          {deck.map((id, i) => (
            <span
              key={id}
              data-testid="onboarding-dot"
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
            />
          ))}
        </div>

        {/* Everything that varies in height lives in one scroll region, so the
            card box stays a fixed size and the footer controls never move
            between cards. */}
        <div className={styles.content}>
          <h1 className={styles.title}>{copy.title}</h1>
          <div className={styles.body}>{copy.body}</div>

          {stepId === 'role' && (
            <div className={styles.choices}>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.choice} ${state.role === r ? styles.choiceOn : ''}`}
                  aria-pressed={state.role === r}
                  onClick={() => setOnboarding({ role: r })}
                >
                  <span className={styles.choiceLabel}>{ROLE_COPY[r].label}</span>
                  <span className={styles.choiceHint}>{ROLE_COPY[r].hint}</span>
                </button>
              ))}
            </div>
          )}

          {stepId === 'comfort' && (
            <div className={styles.choices}>
              {COMFORTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.choice} ${state.comfort === c ? styles.choiceOn : ''}`}
                  aria-pressed={state.comfort === c}
                  onClick={() => setOnboarding({ comfort: c })}
                >
                  <span className={styles.choiceLabel}>{COMFORT_COPY[c].label}</span>
                  <span className={styles.choiceHint}>{COMFORT_COPY[c].hint}</span>
                </button>
              ))}
            </div>
          )}

          {/* `margin-top: auto` parks the figure at the foot of the scroll
              region, so the slack a short card leaves is where it lands. */}
          {art && <div className={styles.art}>{art}</div>}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.ghostBtn} onClick={skipOnboarding}>
            Skip onboarding
          </button>
          <div className={styles.footerRight}>
            {index > 0 && (
              <button type="button" className={styles.secondaryBtn} onClick={back}>
                Back
              </button>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!canAdvance}
              onClick={next}
            >
              {isLast ? 'Start using Jnana' : 'Next'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

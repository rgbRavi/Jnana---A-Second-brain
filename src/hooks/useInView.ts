// One-shot viewport gate: returns a ref to attach to a placeholder element and a
// flag that flips true (and stays true) the first time it scrolls into view.
// Lets an expensive embed defer its work — pdf.js rendering, a link-preview
// fetch — until it's actually on screen, without every card paying up front.
// Same IntersectionObserver pattern as AsyncImage, factored out for reuse.

import { useEffect, useRef, useState } from 'react'

/**
 * @param enabled  When false, `inView` starts true and no observer is created
 *                 (opt out of laziness, e.g. dense canvas contexts).
 * @param rootMargin  Pre-load margin so content is ready slightly before it
 *                    enters the viewport.
 */
export function useInView<T extends Element>(
  enabled = true,
  rootMargin = '200px',
): readonly [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setInView(true)
      return
    }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, rootMargin])

  return [ref, inView] as const
}

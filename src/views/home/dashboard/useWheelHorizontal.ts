import { useEffect, type RefObject } from 'react'

/**
 * Translate vertical wheel scrolling into horizontal scrolling on a horizontally
 * overflowing element (e.g. the Continue Learning card strip). Uses a native
 * non-passive listener so it can preventDefault the page scroll.
 */
export function useWheelHorizontal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return // nothing to scroll horizontally
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // let real horizontal gestures pass
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}

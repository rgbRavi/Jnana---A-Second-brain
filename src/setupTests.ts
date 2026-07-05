import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

afterEach(() => {
  cleanup()
})

// jsdom has no IntersectionObserver; lazy embeds (useInView / AsyncImage) need
// one. Mock it to report the element as immediately in view so lazy-gated
// content renders synchronously in tests instead of staying a placeholder.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
  constructor(private callback: IntersectionObserverCallback) {}
  observe = (el: Element) => {
    this.callback(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      this,
    )
  }
  unobserve = () => {}
  disconnect = () => {}
  takeRecords = () => []
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

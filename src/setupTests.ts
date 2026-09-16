// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

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

// jsdom has no ResizeObserver; the table's sticky horizontal scrollbar observes
// its scroll container. A no-op mock is enough (tests don't measure layout).
class MockResizeObserver {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Every LiveEditor mount subscribes to Tauri's window-level file-drop events;
// jsdom has no Tauri runtime. A test that needs to drive a drop overrides this
// with its own capturing mock.
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}))

// jsdom does no layout, so a Range has no client rects — CM6's posAtCoords
// (used to place the caret where a file was dropped) walks them. Empty lists
// are enough; nothing here asserts on geometry.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([] as unknown[], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

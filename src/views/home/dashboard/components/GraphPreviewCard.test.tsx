// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { GraphPreviewCard } from './GraphPreviewCard'

// One entry per real *mount* (the effect runs once per instance), so a remount
// via a changed key is distinguishable from a re-render with new props. That
// distinction is the fix under test: resizing an existing force-graph instance
// leaves its viewport panned off the nodes.
const instances: { w: number; h: number }[] = []

vi.mock('react-force-graph-2d', () => ({
  default: ({ width, height }: { width: number; height: number }) => {
    useEffect(() => {
      instances.push({ w: width, h: height })
    }, [])
    return <canvas data-testid="fg" width={width} height={height} />
  },
}))

/** Drives the ResizeObserver callback the component registers. */
let fireResize: (() => void) | null = null
let currentSize = { w: 400, h: 300 }

class CapturingResizeObserver {
  constructor(private cb: () => void) {
    fireResize = () => this.cb()
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const nodes = [
  { id: 'a', title: 'A', val: 1, color: '#fff' },
  { id: 'b', title: 'B', val: 1, color: '#fff' },
]
const links = [{ source: 'a', target: 'b' }]
const stats = { nodes: 2, links: 1, largest: 2, orphans: 0 }

describe('GraphPreviewCard resizing', () => {
  beforeEach(() => {
    instances.length = 0
    currentSize = { w: 400, h: 300 }
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver)
    // jsdom does no layout, so the component would measure 0×0 and never render
    // the graph at all.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => currentSize.w,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => currentSize.h,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('mounts the graph at the measured size', () => {
    render(<GraphPreviewCard nodes={nodes} links={links} stats={stats} onOpen={() => {}} />)
    expect(instances).toEqual([{ w: 400, h: 300 }])
  })

  it('holds the old size until a drag-resize settles, then remounts at the new one', () => {
    render(<GraphPreviewCard nodes={nodes} links={links} stats={stats} onOpen={() => {}} />)

    // A drag: many observer callbacks in quick succession, none settling.
    for (const w of [420, 460, 520, 600]) {
      currentSize = { w, h: 300 }
      act(() => {
        fireResize?.()
        vi.advanceTimersByTime(20)
      })
    }
    // Still the original size — the canvas must not be resized per frame.
    expect(instances).toEqual([{ w: 400, h: 300 }])

    // Drag ends; the debounce elapses.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(instances).toEqual([
      { w: 400, h: 300 },
      { w: 600, h: 300 },
    ])
  })

  it('renders an empty state instead of a graph when there are no notes', () => {
    const { queryByTestId } = render(
      <GraphPreviewCard nodes={[]} links={[]} stats={{ ...stats, nodes: 0 }} onOpen={() => {}} />,
    )
    expect(queryByTestId('fg')).toBeNull()
  })
})

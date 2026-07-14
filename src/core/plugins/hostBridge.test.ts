// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeAll } from 'vitest'
import { rewritePluginImports } from './hostBridge'

beforeAll(() => {
  // jsdom may lack URL.createObjectURL; provide a deterministic, distinguishable one.
  let n = 0
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => `blob:mock-${++n}`
})

describe('rewritePluginImports', () => {
  it('rewrites exactly-quoted react + jsx-runtime specifiers, leaving others alone', () => {
    const code = [
      `import { jsx } from "react/jsx-runtime";`,
      `import React from 'react';`,
      `import ReactDOM from "react-dom";`,
      `const s = "react is a library";`,
    ].join('\n')

    const out = rewritePluginImports(code)

    // jsx-runtime resolves to the first-created shim, react to the other; both blobs.
    expect(out).toMatch(/from "blob:mock-\d+";/)
    // The bare react-dom import is untouched.
    expect(out).toContain('"react-dom"')
    // The exact bare specifiers are gone (replaced by blob URLs).
    expect(out).not.toContain('"react/jsx-runtime"')
    expect(out).not.toContain(`'react'`)
    expect(out).not.toContain('"react";')
    // An unrelated string literal that merely contains the word react is preserved.
    expect(out).toContain('"react is a library"')
  })
})

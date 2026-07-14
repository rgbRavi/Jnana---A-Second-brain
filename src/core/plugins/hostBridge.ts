// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Host runtime bridge for loaded plugins. A plugin's UI (note-type View/Editor)
// must share the *host's* React instance — two React copies break hooks. Rather
// than rely on import maps (which browsers reject once module loading has begun),
// the loader rewrites the plugin's bare `react` / `react/jsx-runtime` imports to
// point at small shim modules (Blob URLs) that re-export the host's React off
// `window`. So a plugin authored with normal JSX + hooks "just works" against the
// app's React, loaded from a Blob with only a `blob:` CSP allowance.

import * as HostReact from 'react'
import * as HostJsxRuntime from 'react/jsx-runtime'

interface JnanaWindow {
  __JNANA_REACT__?: typeof HostReact
  __JNANA_JSX__?: typeof HostJsxRuntime
}

;(window as unknown as JnanaWindow).__JNANA_REACT__ = HostReact
;(window as unknown as JnanaWindow).__JNANA_JSX__ = HostJsxRuntime

const REACT_SHIM = `const R = window.__JNANA_REACT__;
export default (R.default ?? R);
export const useState=R.useState, useEffect=R.useEffect, useRef=R.useRef,
  useMemo=R.useMemo, useCallback=R.useCallback, useContext=R.useContext,
  useReducer=R.useReducer, useLayoutEffect=R.useLayoutEffect,
  useSyncExternalStore=R.useSyncExternalStore, useId=R.useId,
  createElement=R.createElement, cloneElement=R.cloneElement,
  createContext=R.createContext, forwardRef=R.forwardRef, memo=R.memo,
  Fragment=R.Fragment, Children=R.Children, isValidElement=R.isValidElement,
  Component=R.Component, PureComponent=R.PureComponent, Suspense=R.Suspense;`

const JSX_SHIM = `const J = window.__JNANA_JSX__;
export const Fragment=J.Fragment, jsx=J.jsx, jsxs=J.jsxs, jsxDEV=(J.jsxDEV ?? J.jsx);`

let reactUrl: string | null = null
let jsxUrl: string | null = null

function shimUrls(): { reactUrl: string; jsxUrl: string } {
  if (!reactUrl) reactUrl = URL.createObjectURL(new Blob([REACT_SHIM], { type: 'text/javascript' }))
  if (!jsxUrl) jsxUrl = URL.createObjectURL(new Blob([JSX_SHIM], { type: 'text/javascript' }))
  return { reactUrl, jsxUrl }
}

/**
 * Rewrite a plugin bundle's bare React import specifiers to the host shim Blob
 * URLs. Matches only exactly-quoted specifiers (so `react-dom` / `my-react` are
 * untouched); jsx-runtime is handled before `react` since its specifier is longer.
 */
export function rewritePluginImports(code: string): string {
  const { reactUrl, jsxUrl } = shimUrls()
  return code
    .replace(/(["'])react\/jsx-dev-runtime\1/g, JSON.stringify(jsxUrl))
    .replace(/(["'])react\/jsx-runtime\1/g, JSON.stringify(jsxUrl))
    .replace(/(["'])react\1/g, JSON.stringify(reactUrl))
}

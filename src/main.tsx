// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initLogging } from "./lib/logger";
import { applyVars, THEME_STORAGE_KEY } from "./core/themes/apply";
import { themeFromPreset } from "./core/themes/presets";
import { registerBuiltinPlugins } from "./plugins";
import type { Theme } from "./types";
import "./main.css"

// Capture uncaught errors + tee console.error/warn into the log file (file logging
// lives Rust-side via tauri-plugin-log). Idempotent.
initLogging()

// Apply the last-known theme synchronously, before the first paint, so there's
// no flash of the default Midnight theme. This reads the localStorage mirror
// only — useTheme() (mounted in AppLayout) reconciles against the SQLite
// source of truth once the app is up.
function applyBootTheme(): void {
  let theme: Theme
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    theme = raw ? (JSON.parse(raw) as Theme) : themeFromPreset("dark")
  } catch {
    theme = themeFromPreset("dark")
  }
  applyVars(document.documentElement, theme)
}
applyBootTheme()

// Register first-party bundled plugins (note types, etc.) before the app mounts,
// so a note's `kind` resolves to its custom view on the very first render.
registerBuiltinPlugins()

if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
  window.location.replace(`${window.location.pathname}#/jnana`);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  
  <React.StrictMode>
    <div>
    <App />
    </div>
  </React.StrictMode>,
);

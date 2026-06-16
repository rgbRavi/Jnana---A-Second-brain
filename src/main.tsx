import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initLogging } from "./lib/logger";
import "./main.css"

// Capture uncaught errors + tee console.error/warn into the log file (file logging
// lives Rust-side via tauri-plugin-log). Idempotent.
initLogging()

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

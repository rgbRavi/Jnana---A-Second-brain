# Sample Checklist — Jnana plugin

A real, third-party Jnana plugin used to smoke-test the plugin **loader runtime**.
It adds a **Checklist** note type (items stored as JSON in the note's content).

## Build

```
npm install     # once (esbuild)
npm run build   # bundles src/index.tsx → dist/main.js (ESM, react external)
```

`react` and `react/jsx-runtime` are marked **external** — Jnana provides its own
React at load time, so the plugin's components run against the host instance
(bundling a second copy would break hooks).

## Load it in the app

Settings → Plugins → Developer → **Load Local Plugin** → pick this folder.
Then Ctrl/⌘-K → **New Checklist** to create one.

## Smoke test

`smoke.test.tsx` imports the built `dist/main.js` (the very bundle the loader
reads), registers its note type, and renders the View/Editor against the host
React — verifying the runtime headlessly. Run it from the repo root with the app's
test command (`npx vitest run examples/sample-plugin/smoke.test.tsx`). The built
bundle is committed; rerun `npm run build` after editing the source.

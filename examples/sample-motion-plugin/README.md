# Confetti on Save — sample motion plugin

Load it: Settings → Plugins → Developer → Load Local Plugin → this folder.

## The motion API in one screen

- Permission: `"permissions": ["motion"]`. Main-thread runtime only (no `"runtime": "worker"`).
- Triggers: `ctx.motion.on(moment, fn)` for app moments (`note:trashing`, `note:created`,
  `note:restored`, `note:favourited`, `note:tagged`, `note:moved`, `quiz:completed`,
  `composer:saving`, `route:changed`, … — list in `src/lib/motion/moments.ts`),
  `ctx.motion.listen(anchor, domEvent, fn)`, `ctx.motion.every(ms, fn)`, `ctx.motion.idle(ms, fn)`.
- Conflicts: one plugin plays per moment. The user picks in Settings → Appearance → Motion;
  otherwise a third-party plugin beats a built-in. `ctx.bus.on` still works but isn't
  arbitrated — use `motion.on` for anything you animate.
- Targets: `ctx.motion.anchor(name, key?)` — names in `src/lib/motion/anchors.ts`.
  Never select by class name; those are hashed and change every release.
- Drawing: `overlay()` for a free layer above the app, `clone(el)` for a copy you can
  wreck, `animate(el, keyframes, options)` for everything (Web Animations API).
- Limits: 10s per animation, 8 live clones, 50 calls/s, `every` ≥ 250ms. Real UI always
  springs back when an animation ends.
- You get switched off when: your `listen`/`every`/`idle` handlers have thrown 5 times
  (a `ctx.bus.on` handler error doesn't count — PluginBus swallows those itself), the
  user presses Ctrl/⌘+Alt+M, reduce-motion is on, or Jnana didn't close cleanly last launch.
- Colours: use theme tokens (`var(--accent)`, `var(--surface-2)`, …) so every theme works.

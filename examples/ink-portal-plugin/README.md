# Ink Portal — motion plugin

Click a sidebar item that switches the view (Home, Notes, Graph, Settings…) and a drop of
ink splashes from where you clicked, then washes across the page as the new view appears.

Load it: Settings → Plugins → Developer → Load Local Plugin → pick **this folder**
(`examples/ink-portal-plugin`, the one with `manifest.json` in it). Jnana asks for the
`motion` permission and offers a backup first.

- Overlay only: nothing in the real interface moves.
- Only sidebar clicks that actually change the view play; toggles and repeat clicks don't.
- Colours follow your theme accent.
- Off switches: disable the plugin in Settings → Plugins, Ctrl/⌘+Alt+M for the session, or
  your OS "reduce motion" setting.

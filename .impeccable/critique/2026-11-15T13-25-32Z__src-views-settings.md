---
target: Settings view
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-11-15T13-25-32Z
slug: src-views-settings
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped: Tauri WebView, no IPC in browser.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Busy states + progress toasts good; silent autosave, no "key saved" confirmation, search jump to gated section fails silently |
| 2 | Match System / Real World | 2 | "Chat (LLM)", Embeddings, Base URL, Top-K, drift, "AI generation"; "Composer toolbar" collides with Composer tab |
| 3 | User Control and Freedom | 3 | Theme reset undo, revocable perms; Esc on focused button/ⓘ leaves Settings; floating window jumps to Home |
| 4 | Consistency and Standards | 2 | Three form dialects (SettingField rows / Theme Studio stacks / Plugins rows + section-label), three widths |
| 5 | Error Prevention | 3 | Key-loss warning before commit; plugin uninstall makes purge the primary choice |
| 6 | Recognition Rather Than Recall | 3 | Search breadcrumbs, disclosure summaries; unlabelled PresetBar; definitions behind ⓘ |
| 7 | Flexibility and Efficiency | 2 | Search only inside General, not in header or Ctrl+K; Theme Studio sub-tab not sticky |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, token-true; AI-on wall, dense plugin cards, Appearance double title |
| 9 | Error Recovery | 3 | Plain connection errors, Index blocker reason; raw error in permission toast, plugin settings writes silent |
| 10 | Help and Documentation | 2 | ⓘ hover/click only; no Ollama setup guidance |
| **Total** | | **26/40** | **Acceptable (was 21)** |

## Anti-Patterns Verdict
Not slop. Detector clean (0 findings, was 5); 0 literal colors, 0 uppercase eyebrows in settings CSS, 0 --bg on accent. One low TP: 0.82em inline code (PluginsPanel.module.css:261). Remaining tell is dialect inconsistency: Theme Studio and Plugins read like different apps; main.css .section-label eyebrow still used in Plugins (PluginPermissions/PluginUpdates/DeveloperTools) at 0.7rem --text-3 (fails AA).

## Priority Issues
1. [P1] Search trapped in General — move to Settings header, "/" or Ctrl+F shortcut, feed SETTINGS_INDEX into command palette; gated anchors land on the gate with a message. → layout
2. [P1] Three form dialects / widths — port Theme Studio fields + plugin rows to SettingField/SettingToggle/SettingSection/SettingPanel. → polish
3. [P1] ⓘ pattern a11y + placement — tooltip pointer-only (WCAG 1.4.13), every button "More info", Esc on pinned hint leaves Settings, term-defining hints hidden in AI generation. Fix: aria-label "About <label>", Esc closes pinned hint first, tooltip on focus-visible, definitional hints hintVisible. → harden, clarify
4. [P2] AI setup speaks engineer — rename tabs (AI setup / AI behaviour), move Web answers beside Web search, "Chat toolbar", label PresetBar "Saved setup", quick-start (Ollama vs API key) on first enable. → onboard, clarify
5. [P2] Visible defects — contrast: --text-3 .muted in plugin cards, .section-label, Built-in badge 3.5:1, plugin sub-nav active 4.35:1, selected select row 3.8:1. (Unstyled AdvancedAiPanel inputs + deep-research key mirror fixed during this run.) → audit

## Persona Red Flags
Alex: no search outside General / Ctrl+K; Theme Studio tab resets; floating window teleports Home; note-context select + separate text box; native datalist next to custom selects.
Sam: N identical "More info" buttons; Esc on focused ⓘ/button/summary exits; tooltip never on focus; plugin switch name flips Enable/Disable while aria-checked; toolbar reorder unannounced; swatches named by hex; search combobox aria-controls points at unrendered listbox.
Student: Chat (LLM) / Embeddings / Base URL; AI generation's Top-K; Create backup vs Back up to a folder vs Export assets; Markdown mirror; "Raw tokens"; no hint AI needs Ollama.

## Minor Observations
- Single-item nav groups (Data, Extensions) add label + hairline for one link.
- Composer "Tables while editing" hint not described-by; Composer has no sections.
- Saved-theme delete is a ✕ glyph, not lucide.
- Plugins footnote names hidden "Developer" sub-view.
- PresetBar select breaks right control column in wide layout.
- Hint punctuation mixed (fragments vs sentences).
- API key has no Remove action.

## Questions
1. Why is search a field inside General rather than the header or Ctrl+K?
2. Should Appearance be three choices (theme, accent, text size) with Theme Studio as opt-in power tool?
3. If a label can't stand without its ⓘ, is the fix a better label or one fewer setting?

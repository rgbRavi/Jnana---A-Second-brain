---
name: Jnana
description: A local-first desktop second brain — calm, trustworthy, capable.
colors:
  bg: "#0d0d0f"
  surface: "#141417"
  surface-2: "#1c1c21"
  surface-3: "#26262e"
  border: "#2a2a32"
  border-hover: "#3d3d4a"
  accent: "#7c6af7"
  accent-hover: "#8a7af8"
  accent-soft: "#22202b"
  text-1: "#f0eff5"
  text-2: "#9896a4"
  text-3: "#6d6b75"
  on-accent: "#ffffff"
  danger: "#e05252"
  success: "#3fb950"
  warning: "#e3b341"
  star: "#ffcc00"
  data-violet: "#7c6af7"
  data-blue: "#3ba7f7"
  data-green: "#3fb950"
  data-amber: "#e3b341"
  data-red: "#e5484d"
  data-pink: "#f778ba"
  data-purple: "#a371f7"
  data-teal: "#56d4bc"
  data-orange: "#ff8c42"
typography:
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.7rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.1em"
  small:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  compact:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  heading-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.55rem"
  md: "0.9rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.95rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.9rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.95rem"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.7rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
---

# Design System: Jnana

## 1. Overview

**Creative North Star: "The Quiet Study"**

Jnana is a dim, focused desk at night. The room is a deep neutral dark; a single violet lamp throws the only warm light, and everything the user isn't touching recedes into the surfaces. The interface is not the subject — the notes, the graph, the marked-up PDF, the connections between ideas are. Chrome stays quiet and subordinate so thinking can come forward. This is a tool for long, private sessions of serious knowledge work, and it should feel calm the moment it opens, with power always one keystroke away.

Depth here is **tonal, not dramatic**. Four stacked neutrals — background `#0d0d0f`, surface `#141417`, surface-2 `#1c1c21`, surface-3 `#26262e` — separated by hairline borders do almost all the layering; real shadows are spent only on things that genuinely float above the page (menus, modals, toasts, the composer pill). Type is a single well-tuned sans (Inter) on a fixed rem scale, with a mono (JetBrains Mono) reserved for small uppercase labels and captions. The violet accent is rare on purpose: primary actions, current selection, links, and focus — nothing decorative.

This system explicitly rejects four things named in PRODUCT.md. It is **not loud SaaS marketing UI** — no gradient-drenched hero-metric dashboards, no purple-on-purple washes, no confetti or growth nudges. It is **not a sterile enterprise tool** — the dark is warm-neutral and lamp-lit, not cold corporate gray. It is **not cluttered or overwhelming** — the resting state is minimum surface, and density is opt-in, never the default. And it is **not toy-like or gimmicky** — restrained rounding, no oversized illustrations, no gamified badges. Warmth is earned through restraint and through opt-in themes/plugins, never bolted on.

**Key Characteristics:**
- Deep neutral-dark canvas; tonal layering over shadow for depth
- One violet accent used sparingly as a signal, never as decoration
- Single sans (Inter) + mono labels (JetBrains Mono); fixed rem scale, tight ratio
- Calm and low-chrome at rest; density, speed, and power reveal on demand
- Fully user-themeable (Theme Studio) — every color is a token, nothing hardcoded
- WCAG 2.1 AA, with a live contrast guardrail across themes

## 2. Colors

A deep neutral-dark palette lit by a single reserved violet, with a tokenized semantic vocabulary for state.

### Primary
- **Violet Lamp** (`#7c6af7`): The one point of light in a dark room. Reserved for primary actions, the current selection, links/wikilinks, focus rings, and active-state indicators — never fills, never decoration. Its rarity is what makes it read. User-themeable via Theme Studio; the whole app repaints from this single token, so it must never be hardcoded. Hover brightens (`#8a7af8`, or `filter: brightness(1.08)`); soft washes route through `accent-soft` (`#22202b`) and `accent-softer`, never a literal `rgba(124,106,247,·)`.

### Neutral
- **Ink** (`#0d0d0f`, `--bg`): The deepest surface — the app background and the inside of inputs.
- **Surface** (`#141417`, `--surface`): The primary content surface — cards, panels, the composer body.
- **Raised** (`#1c1c21` / `#26262e`, `--surface-2` / `--surface-3`): Sidebars, toolbars, popover interiors, hover fills. The second neutral layer that separates panel from content.
- **Hairline** (`#2a2a32` border / `#3d3d4a` border-hover): 1px separators and control strokes. Borders, not shadows, do the everyday work of separation.
- **Text — Primary** (`#f0eff5`, `--text-1`): Headings, note body, active labels. High contrast on every surface.
- **Text — Secondary** (`#9896a4`, `--text-2`): Supporting labels, inactive nav, metadata.
- **Text — Muted** (`#6d6b75`, `--text-3`): Captions, placeholders, timestamps. Meets WCAG AA-large/UI (≥3:1) on surface; stays below `--text-2` in the ramp.

- **On-Accent** (`#ffffff`, `on-accent`): The text/icon color that sits *on top of* a filled accent (or other saturated) surface — primary buttons, active pills. White reads on every theme's accent, so it's a fixed literal by design, not a themed neutral.

### Semantic
- **Danger** (`#e05252`, `--danger`): Destructive actions and errors. The token is normative — do not use the old `#e5484d` fallback, which renders a different red.
- **Success** (`#3fb950`, `--success`): Confirmations, healthy/indexed status.
- **Warning** (`#e3b341`, `--warning`): Caution, stale-index flags.
- **Star** (`#ffcc00`, `--star`): Favourites only.

### Categorical (data) palette
A fixed set of distinct hues used to tell **categories apart** — stat-card icons, graph community colors, workspace/preset color tags, dashboard series. These are **data colors, not UI accent**: they identify a category, so they stay put across a re-theme (like chart series colors) rather than tracking `--accent`. The set, in order: **violet** `#7c6af7` (= the default accent; the primary/first category), **blue** `#3ba7f7`, **green** `#3fb950`, **amber** `#e3b341`, **red** `#e5484d`, **pink** `#f778ba`, **purple** `#a371f7`, **teal** `#56d4bc`, **orange** `#ff8c42`. Keep this list the single source — don't invent per-surface one-offs. Where a surface shows the *primary/accent* category specifically (e.g. a "Notes" hero metric), prefer `var(--accent)` so it tracks the theme.

### Named Rules
**The Data-Color-Is-Not-Accent Rule.** The categorical palette above identifies categories and does **not** re-theme; `--accent` marks action/selection/focus and **does**. Never reach into the data palette for a UI accent, and never use `--accent` to distinguish two data categories — they'd collide the moment the theme changes.

**The Violet Lamp Rule.** The accent lights one thing at a time. It marks the primary action, the current selection, a link, or focus — and nothing else. If a screen has violet on more than a small fraction of its surface, it has stopped being a signal and become decoration; pull it back to a soft neutral wash (`accent-soft`) instead.

**The Token-Only Rule.** Every color on screen is a CSS custom property. Hardcoding `#7c6af7`, an `rgba(124,106,247,·)` wash, or a hex shadow is forbidden — Theme Studio re-themes the app by swapping tokens, so a literal silently breaks on the light, sepia, and high-contrast presets.

## 3. Typography

**Body / UI Font:** Inter (with `sans-serif` fallback)
**Label / Mono Font:** JetBrains Mono (with `monospace` fallback)

**Character:** One warm, highly legible geometric-humanist sans carries everything — headings, buttons, labels, note body, data. A single mono is used only for small uppercase section labels and captions, where its even rhythm reads as "system voice." No display font, no serif pairing: this is product UI, and the type should disappear into the reading.

### Hierarchy
- **Headline** (600, 1.5rem, line-height 1.3, letter-spacing −0.01em): View and section titles (dashboard heading, panel titles).
- **Title** (600, 1.125rem, line-height 1.35): Card titles, note titles, dialog headers.
- **Body** (400, 0.9375rem/15px, line-height 1.6): Note content and reading surfaces. Cap prose at 65–75ch; the search/settings columns already clamp to ~820px for this reason.
- **Label** (500, 0.7rem, letter-spacing 0.1em, UPPERCASE, JetBrains Mono): The `.section-label` caption — small mono kickers over a section or view. Used deliberately as a system voice, not sprinkled above every block.

### Named Rules
**The Fixed-Scale Rule.** Type sizes are fixed rem, never fluid `clamp()`. Users work at a consistent DPI in a desktop window; a heading that shrinks inside a narrow sidebar looks broken, not responsive. Reserve the tight modular scale (~1.15–1.2) for a calm hierarchy with many UI elements.

**The Mono-Is-A-Label Rule.** JetBrains Mono is for small uppercase labels, captions, timestamps, and code — never for body prose or headings. Its job is to signal "metadata / system," and overusing it makes the UI read as a terminal, which this isn't.

## 4. Elevation

The system is **flat and tonal by default.** Depth comes from stacking four neutrals (bg → surface → surface-2 → surface-3) and separating them with 1px hairline borders, not from shadows on every card. Shadows are reserved for surfaces that genuinely float above the page and need to detach from what's behind them — menus, popovers, modals, toasts, the docked composer pill. A card at rest casts no shadow; it's distinguished by its lighter surface tone and its border.

### Shadow Vocabulary
- **`--shadow-sm`** (`0 2px 8px rgba(0,0,0,0.3)`): Subtle lift — chips, small popovers, hover raises.
- **`--shadow-md`** (`0 8px 24px rgba(0,0,0,0.22)`): Dropdowns, the composer pill, inline menus.
- **`--shadow-lg`** (`0 12px 36px rgba(0,0,0,0.45)`): Floating panels, the command palette.
- **`--shadow-xl`** (`0 20px 60px rgba(0,0,0,0.5)`): Modals and the note peek.
- **`--shadow-2xl`** (`0 24px 70px rgba(0,0,0,0.55)`): The heaviest overlays (fullscreen viewers).

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; a shadow appears only because something is floating (a menu, a modal) or responding to state (a hover lift). If a static card has a drop shadow just to look "designed," remove it — tonal layering plus a hairline border is the house style. Never hand-roll a bespoke `rgba(0,0,0,·)` shadow; pick a `--shadow-*` step so every floating surface shares one depth language.

## 5. Components

### Buttons
- **Shape:** Gently rounded (`--radius-sm`, 6px). Consistent across the app.
- **Primary:** Solid violet (`background: var(--accent)`), white text, `1px solid var(--accent)`, padding `0.45rem 0.95rem`, weight 600. The single strong call to action in a dialog or bar.
- **Hover / Focus:** `filter: brightness(1.08)` on hover; `:focus-visible` draws the global 2px accent ring at 2px offset. Disabled drops to `opacity: 0.45` with `not-allowed`.
- **Secondary / Cancel:** Transparent background, `1px solid var(--border)`, `--text-2`; on hover the border goes to `--border-hover` and text to `--text-1`. This is the default, quiet button — accent is spent only on the one primary.
- **Danger:** Same solid shape with `--danger` background/border (destructive confirms only).

### Inputs / Fields
- **Style:** `background: var(--bg)` (the input sits *below* its surface), `1px solid var(--border)`, `--radius-sm`, padding `0.6rem 0.7rem`, Inter at ~0.9rem.
- **Focus:** Border shifts to `var(--accent)` (`transition: border-color 0.15s`) — no glow, no ring stacking on top of the border shift.
- **Placeholder:** `--text-3`. (Note: placeholder contrast must still clear AA; don't let it drift lighter for "elegance.")

### Cards / Containers
- **Corner Style:** `--radius-lg` (14px) for content cards; `--radius-xl` (16px) for large dashboard/hero cards. Never nest a card inside a card.
- **Background:** `--surface`, on the `--bg` canvas; internal panels step up to `--surface-2`/`-3`.
- **Shadow Strategy:** None at rest (see Elevation) — separation is tone + a `1px solid var(--border)`.
- **Internal Padding:** ~`--lg` (1.25rem) for content cards.

### Navigation (Sidebar)
- **Style:** A quiet left rail on `--surface-2`. Items are `--text-2` at rest, `--radius-sm` targets.
- **Active state:** Text and icon go to `var(--accent)` over a soft `accent-soft` wash — the Violet Lamp marking "you are here." Never a full-saturation accent fill on the whole item.
- **Collapsible:** The rail collapses to a thin icon strip (structural responsive behavior, not fluid type); the file-explorer second sidebar and right toolbar rail follow the same collapse pattern.

### Signature Component — The Composer Pill
Jnana's most distinctive control: a collapsed "take a note" **pill** (`border-radius: 999px`, `1px solid var(--border-hover)`, `--text-2`) floating at the bottom of the content area, tracking both sidebars. It casts a real shadow (it floats); on hover its border warms to `var(--accent)` and text to `--text-1`. Clicking expands it into the full docked composer. It embodies the North Star: the writing surface is quietly present, out of the way, one click from ready.

## 6. Do's and Don'ts

### Do:
- **Do** route every color through a token (`var(--accent)`, `var(--surface)`, `var(--text-1)`) so Theme Studio can re-theme the whole app in one repaint.
- **Do** convey depth with tonal layering (bg → surface → surface-2 → surface-3) plus 1px hairline borders; reserve `--shadow-*` for things that actually float.
- **Do** spend the violet accent on one thing at a time — primary action, current selection, link, or focus — and let soft `accent-soft` washes carry everything "accent-adjacent."
- **Do** keep the resting state calm and minimal; reveal density, keyboard power, and advanced controls on demand (command palette, rails, hover chrome).
- **Do** use fixed rem type sizes and a single sans (Inter); keep JetBrains Mono for small uppercase labels and captions only.
- **Do** give every interactive control its full state set (default, hover, `:focus-visible`, active, disabled, loading, error) and keep the same button/input vocabulary on every screen.
- **Do** verify AA contrast across all Theme Studio presets — including placeholder text — using the built-in guardrail.

### Don't:
- **Don't** ship loud SaaS marketing UI: no gradient-drenched hero-metric dashboards, no purple-on-purple washes, no confetti, no growth-hacky nudges or upsells.
- **Don't** let it read as a sterile enterprise tool — no cold, joyless corporate gray; the dark is warm-neutral and lamp-lit.
- **Don't** crowd the default view into a cluttered, overwhelming Notion/Obsidian-at-its-busiest panel storm; minimum surface is the resting state, density is opt-in.
- **Don't** make it toy-like or gimmicky: no rounded-everything, no oversized playful illustrations, no gamified badges.
- **Don't** hardcode `#7c6af7`, an `rgba(124,106,247,·)` wash, or a bespoke `rgba(0,0,0,·)` shadow — literals break re-theming and fragment the depth language.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards, list items, or callouts; use a full hairline border or a soft tonal fill.
- **Don't** use gradient text (`background-clip: text`), fluid `clamp()` UI headings, or display fonts in labels, buttons, and data.
- **Don't** reach for a modal as the first thought — exhaust inline and progressive alternatives; and never nest a card inside a card.

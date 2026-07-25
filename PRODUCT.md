# Product

## Register

product

## Platform

web

## Users

Jnana's primary user is a **student** organizing course material, notes, PDFs, and media over a term — studying, quizzing, and connecting ideas. Researchers are a close second: depth-first knowledge workers building a long-lived linked corpus and doing grounded synthesis over their own sources. Beyond those, casual users keep a personal knowledge base at whatever depth suits them.

Rather than guess, Jnana **asks who you are on first run** (student / researcher / casual / prefer-not-to-say) and adapts the interface to match, so the same product can serve a first-year student and a career researcher without forcing either into the other's workflow. The design default optimizes for the student, but no path is second-class.

The shared context is someone working alone, on their own machine, with their own material — often for a long focused session (writing, linking notes, marking up a PDF, synthesizing a week of reading). The job to be done: turn a pile of notes and media into connected, retrievable, trustworthy knowledge.

## Product Purpose

Jnana is a **local-first desktop "second brain"** — notes, media, and the links between them in one place, with an optional, locally-grounded AI layer that works only over the user's own notes and can run fully offline. It exists so that thinking and reference material live together, privately, on the user's device (plain SQLite + a local assets folder), rather than scattered across cloud tools the user doesn't control.

Success looks like a user who trusts Jnana with everything: their notes accumulate into a graph they actually explore, media lives inside their notes instead of beside them, and the AI answers from their own corpus with citations rather than inventing facts. The product succeeds when it becomes the place a serious thinker keeps their knowledge — and can take it with them (portable Markdown, restorable backups) at any time.

## Brand Personality

Calm, trustworthy, capable. Jnana carries quiet confidence: a serious tool that respects the user's attention and their data. Warmth is real but subtle and earned — some of it from the core, some from plugins and themes the user opts into — never applied as decoration. The default experience is **calm and focused** (low-chrome, distraction-free, the tool receding so thinking comes forward), with **capable and fast** always underneath (keyboard-driven, dense when the user wants it, never sluggish or dumbed-down). Across every mode, **trust is non-negotiable** — local-first ownership, nothing hidden, the user's work never lost or leaked.

The voice is precise and unhurried: it informs, it doesn't nag or hype. It speaks like a good notebook, not a growth-hacky app.

## Anti-references

Jnana should explicitly **not** look or feel like:

- **Loud SaaS marketing UI** — gradient-drenched hero-metric dashboards, purple-on-purple washes, emoji confetti, growth-hacky nudges and upsells.
- **Sterile enterprise tooling** — cold, gray, joyless admin-panel density that feels like corporate software you're forced to use.
- **Cluttered / overwhelming knowledge tools** — Notion/Obsidian at their busiest, with too many panels, chrome, and options competing at once and high cognitive load by default.
- **Toy-like / gimmicky software** — rounded-everything, oversized playful illustrations, gamified badges that undermine that this is a serious thinking tool.

The default target is **minimum, calm surface**. Personality and intensity are opt-in, not imposed: onboarding also asks *"what do you want Jnana to look like?"* — default, max-power, minimalist, casual, fun, wonky — so the user chooses their register instead of the product picking one loud aesthetic for everyone.

## Design Principles

- **Ask, then adapt.** First-run asks who the user is and how they want Jnana to look; the interface meets them there instead of forcing one workflow or aesthetic on everyone. Adaptivity is a first-class product behavior, not a settings afterthought.
- **Calm by default, power on demand.** The resting state is quiet and low-chrome so thinking comes forward; density, speed, and advanced controls reveal themselves when the user reaches for them (keyboard, rails, command palette) rather than crowding the default view.
- **Trust is a design surface.** Local-first ownership, no hidden network calls, portability, and reversible/destructive-action confirmations are things the user should be able to *feel* in the UI — privacy and control are part of the craft, not fine print.
- **The tool recedes; the knowledge stands forward.** Chrome, panels, and controls stay subordinate to the user's own content — their notes, graph, media, and connections are the interface's subject.
- **Warmth is earned, never decorative.** Character comes through in restrained, meaningful moments (and through opt-in themes/plugins), never through gratuitous ornament that would make a serious tool feel like a toy.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: AA contrast on body and large text, full keyboard navigation, visible `:focus-visible` rings, `prefers-reduced-motion` alternatives for every animation, and screen-reader-appropriate labeling. This matches guardrails already in the codebase — Theme Studio ships a live WCAG contrast check (AA / AAA / AA Large / Fail) over the critical text/surface pairs, and global CSS already handles focus rings and reduced motion. Because Theme Studio lets users author custom themes, contrast must stay verifiable across themes, not just the default. Reading comfort on long-form surfaces (line length, spacing, reading-scale controls) is an ongoing concern given the studying/research use case.

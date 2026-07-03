# astro_idea.md

**Status:** someday / fun · not a Phase commitment · captured because it doubles as a template

A scratch note for an astrology plugin — and the realization that it's actually a blueprint for
**domain content packs** riding Jnana's existing AI layer.

---

## The core insight

This isn't new infrastructure. It's **RAG**, which Jnana already has. The astrology feature is a
*content pack* + a thin chart-aware layer on top of the AI layer that already ships.

The flow:

```
chart → look up the relevant meaning-notes → AI synthesizes a reading FROM those notes, citing them
```

The model stops being an "astrology-opinion-haver" pulling from training data and becomes a
**synthesizer of a curated corpus** — exactly the grounded behavior the README already promises
(answers only from your notes, cites source notes, never invents facts).

### Why grounded beats raw LLM here

- **Consistency** — raw models drift to generic horoscope mush and answer differently every time.
  Grounded in fixed notes, readings are coherent and reproducible: same chart, same source meanings.
- **It's the author's voice, not the model's** — traditional/Hellenistic vs modern/psychological
  astrology disagree profoundly. **Whoever writes the notes defines the system.** Swap the pack, get
  a different school. The engine stays neutral; the corpus is the worldview.
- **Citations are a real feature** — "Mars square Venus suggests X `[[Mars square Venus]]`" lets the
  user click through to the actual meaning note, read it in full, edit it, disagree. The reading is
  navigable, not a black box. No chatbot astrology app does this.

---

## The make-or-break decision: note granularity

RAG retrieval pulls the most relevant chunks, so the corpus must be sliced the way charts are
queried:

- One note per **planet**, **sign**, **house**, **aspect type**, and ideally per
  **planet-pair-aspect** (`[[Mars square Venus]]`, `[[Moon trine Saturn]]`). It's a lot of notes —
  but they are the exact retrieval targets. Granular notes = precise retrieval.
- This is also a clean **graph**: `[[Mars square Venus]]` links to `[[Mars]]`, `[[Venus]]`,
  `[[Square]]`. The corpus self-assembles into a correspondence web. The graph view and the RAG
  index are the same content seen two ways.

**Caveat:** all aspects between all planets is a big combinatorial set, and a chart fires many at
once. Plan for:
- **Scoped retrieval** — put the pack in its own **workspace** and use the existing per-workspace AI
  scope so a reading retrieves only from the astrology corpus, not the user's other notes.
- **Chart-aware (deterministic) retrieval** — the plugin knows the actual placements, so it can
  *fetch exactly those notes by lookup* rather than hoping semantic search finds them. Hybrid:
  deterministic "look up the known notes" + RAG to fill surrounding context.

---

## Where it lands in the architecture (mostly already built)

The plugin's real job is thin:

1. **Chart calc** — ephemeris math, **pure functions** (date/time/place → placements + aspects).
2. **Map placements → note lookups** — "Sun in Gemini" → fetch `[[Sun]]`, `[[Gemini]]`,
   `[[Sun in Gemini]]`. Deterministic, not AI.
3. **Hand that set to the existing RAG/agent** as scoped context with a reading-shaped prompt.
4. **Render** — a chart **wheel** (custom SVG; *not* the force-graph — fixed 360° geometry) + the
   cited reading.

Everything load-bearing — embeddings, retrieval, grounded chat, citations, workspace scope — already
ships. Uses the same note/link/event-bus APIs community plugins use (a good stress test of the
plugin API: if it needs a special hook, that's a gap worth fixing).

---

## Cautions

- **Bring-your-own-key still applies** — readings run through the user's provider or local Ollama
  (on-brand: local-first, optional AI). Offer a **no-AI fallback**: clicking placements to read the
  linked notes manually is already a complete, useful product. Don't make the corpus worthless
  without a key.
- **Frame as interpretation/reflection, not prediction** — keep it fun. "For fun / self-reflection"
  framing in the UI plus the click-through citations keep it transparent rather than oracular, which
  matters for wellbeing.

---

## The bigger thing: this is a domain-pack template

The pattern generalizes to **any domain that's secretly a correspondence graph + a lookup corpus**.
The shape is always the same:

```
calculate / parse something → map results to notes → scope-retrieve → synthesize a grounded, cited answer → render
```

If the plugin API can express *this* cleanly, it validates the "plugins as the open-source moat" bet.
Candidate packs:

- **Tarot** — note per card (upright/reversed) + spread positions. "Calculate" = the drawn spread;
  map cards+positions to notes; grounded reading with citations to each card's note. Nearly identical
  shape to astrology.
- **D&D / TTRPG & worldbuilding** — notes for lore, NPCs, locations, items, factions, rules. "Parse"
  = the current scene/query; retrieve relevant lore; the AI answers *only from the campaign's canon*
  (no inventing facts that contradict the world). The graph is the relationship map DMs already keep
  by hand. Strong niche-within-niche, like the astrology audience.
- **Law / contracts** — notes per clause, statute, definition, precedent. Parse a document → retrieve
  matching clause-notes → grounded summary citing the exact source notes. Grounding + citations are
  not optional here — they're the whole value (and the safety boundary: synthesize the corpus, don't
  opine).
- **Medicine / study** — symptom → condition notes, drug-interaction notes. A med student's vault
  where the AI reasons *from their curated notes*, citing them, instead of from training data.
- **Recipes / ingredients** — ingredient and technique notes, substitution links. "What pairs with
  X?" is a graph-neighbors query; the AI composes from the user's own collection.
- **Genealogy** — person notes, relationship links; the graph *is* the family tree; retrieval answers
  "how is A related to B" from the user's records.

Astrology is just the vivid first instance. The reusable artifact is the **template**, not the
zodiac.

---

## TL;DR

- It's RAG + a content pack, not new infrastructure — rides the AI layer that already exists.
- Granular notes (down to per-aspect) = precise retrieval **and** a self-assembling correspondence graph.
- Plugin = chart calc (pure) + placement→note lookup (deterministic) + existing scoped RAG + a wheel view.
- Keep the engine neutral, the worldview in the corpus; ground everything, cite everything.
- Ship a no-AI fallback; frame as reflection, not prediction.
- Same shape → tarot, D&D/worldbuilding, law, medicine, recipes, genealogy. Validates plugins as the moat.
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Schematic diagrams for the onboarding cards — one per card that has room for
// one. Deliberately NOT illustrations: PRODUCT.md's anti-references call out
// "oversized playful illustrations" as toy-like, so these read as technical
// documentation figures. Neutral 1.5px strokes for structure, exactly one
// accent element per diagram carrying the thing the card is about.
//
// Every colour is a design token, so they re-theme with the app instead of
// clashing the way a fixed-colour screenshot would. They are decorative —
// the card copy carries the meaning — hence `aria-hidden` on each root.
//
// To swap one for a cropped screenshot later, replace its entry in STEP_ART
// with an image element — and give that one a real alt text, since a capture of
// the UI is not decorative in the same way a schematic is.

import type { ReactNode } from 'react'
import type { StepId } from '../../core/onboarding/steps'

const VB = '0 0 320 120'

/** Structure stroke shared by every figure. */
const line = {
  fill: 'none',
  stroke: 'var(--border-strong)',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** The one emphasised element per figure. */
const accent = { ...line, stroke: 'var(--accent)' } as const

const panel = { fill: 'var(--surface-2)', stroke: 'var(--border-strong)', strokeWidth: 1.5 } as const

/** Stand-in for text: short muted rules. */
function Lines({ x, y, w, n = 3, gap = 8 }: { x: number; y: number; w: number; n?: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * gap}
          width={i === n - 1 ? w * 0.6 : w}
          height={2}
          rx={1}
          fill="var(--text-3)"
          opacity={0.55}
        />
      ))}
    </>
  )
}

function Arrow({ x1, x2, y, on = false }: { x1: number; x2: number; y: number; on?: boolean }) {
  const s = on ? accent : line
  return (
    <>
      <path d={`M${x1} ${y} H${x2}`} {...s} />
      <path d={`M${x2 - 5} ${y - 4} L${x2} ${y} L${x2 - 5} ${y + 4}`} {...s} />
    </>
  )
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={VB} role="presentation" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

// ─── Figures ─────────────────────────────────────────────────────────────────

/** A machine holding its own linked graph — nothing leaves it. */
const Welcome = (
  <Figure>
    <rect x={88} y={14} width={144} height={84} rx={8} {...panel} />
    <path d="M74 104 H246" {...line} />
    <path d="M132 46 L178 38 M178 38 L156 78 M132 46 L156 78" {...accent} />
    <circle cx={132} cy={46} r={6} {...line} fill="var(--surface)" />
    <circle cx={178} cy={38} r={6} {...line} fill="var(--surface)" />
    <circle cx={156} cy={78} r={6} fill="var(--accent)" stroke="none" />
  </Figure>
)

/** The docked composer, and the kinds of thing that go into it. */
const Capture = (
  <Figure>
    <rect x={40} y={12} width={240} height={96} rx={8} {...panel} />
    {/* image · document · audio · video */}
    <rect x={98} y={30} width={22} height={22} rx={4} {...line} />
    <circle cx={105} cy={38} r={2.5} {...line} />
    <path d="M100 48 L107 41 L118 52" {...line} />
    <rect x={132} y={30} width={22} height={22} rx={4} {...line} />
    <path d="M137 37 H149 M137 41 H149 M137 45 H144" {...line} />
    <rect x={166} y={30} width={22} height={22} rx={4} {...line} />
    <path d="M171 45 V37 M175 48 V34 M179 43 V39 M183 46 V36" {...line} />
    <rect x={200} y={30} width={22} height={22} rx={4} {...line} />
    <path d="M207 35 L216 41 L207 47 Z" {...line} />
    {/* the composer itself */}
    <rect x={58} y={72} width={204} height={22} rx={11} {...accent} />
    <path d="M70 78 V88" {...accent} />
  </Figure>
)

/** Two notes joined by a wikilink, and one link that has no note yet. */
const Links = (
  <Figure>
    <rect x={26} y={32} width={78} height={56} rx={6} {...panel} />
    <Lines x={38} y={46} w={54} />
    <rect x={132} y={32} width={78} height={56} rx={6} {...panel} />
    <Lines x={144} y={46} w={54} />
    <path d="M104 60 H132" {...accent} />
    <path d="M112 52 L109 56 L112 60 M124 52 L127 56 L124 60" {...accent} />
    <path d="M210 60 H248" {...line} strokeDasharray="3 4" />
    <circle cx={264} cy={60} r={14} {...line} strokeDasharray="3 4" />
  </Figure>
)

/** A note sits in exactly one folder; a workspace cuts across them. */
const Organize = (
  <Figure>
    <rect x={20} y={12} width={196} height={96} rx={8} {...panel} />
    <rect x={32} y={32} width={80} height={64} rx={5} {...line} fill="var(--surface)" />
    <rect x={124} y={32} width={80} height={64} rx={5} {...line} fill="var(--surface)" />
    <rect x={42} y={44} width={60} height={18} rx={3} {...line} fill="var(--surface-2)" />
    <rect x={42} y={70} width={60} height={18} rx={3} {...line} fill="var(--surface-2)" />
    <rect x={134} y={44} width={60} height={18} rx={3} {...line} fill="var(--surface-2)" />
    {/* The workspace crosses both folders but stays inside the vault —
        workspaces are per-vault (workspaces.vault_id), so a lasso spilling past
        the vault edge would be drawing a relationship the app doesn't have. */}
    <rect x={36} y={38} width={166} height={30} rx={15} {...accent} strokeDasharray="4 4" />
  </Figure>
)

/** Lecture audio becomes text, and text becomes a graded question. */
const StudyKit = (
  <Figure>
    <path d="M26 60 V60 M32 50 V70 M38 42 V78 M44 54 V66 M50 46 V74 M56 52 V68 M62 44 V76" {...line} />
    <Arrow x1={74} x2={94} y={60} />
    <rect x={104} y={34} width={70} height={52} rx={5} {...panel} />
    <Lines x={114} y={48} w={50} n={4} gap={7} />
    <Arrow x1={184} x2={204} y={60} />
    <rect x={214} y={34} width={80} height={52} rx={5} {...panel} />
    <circle cx={228} cy={52} r={5} {...accent} />
    <path d="M225.5 52 L227.5 54 L231 50" {...accent} />
    <rect x={240} y={50} width={42} height={3} rx={1.5} fill="var(--text-3)" opacity={0.55} />
    <circle cx={228} cy={70} r={5} {...line} />
    <rect x={240} y={68} width={30} height={3} rx={1.5} fill="var(--text-3)" opacity={0.55} />
  </Figure>
)

/** Marks live over the page, and the text underneath stays searchable. */
const ResearchKit = (
  <Figure>
    <rect x={34} y={10} width={112} height={100} rx={5} {...panel} />
    <Lines x={48} y={26} w={84} n={3} />
    <rect x={46} y={56} width={88} height={12} rx={3} fill="var(--accent)" opacity={0.28} />
    <Lines x={48} y={78} w={84} n={3} />
    <rect x={184} y={46} width={106} height={28} rx={14} {...line} />
    <circle cx={202} cy={60} r={6} {...line} />
    <path d="M206.5 64.5 L211 69" {...line} />
    <rect x={216} y={59} width={56} height={3} rx={1.5} fill="var(--text-3)" opacity={0.55} />
    <path d="M182 60 H150" {...accent} strokeDasharray="4 4" />
    <path d="M155 55 L150 60 L155 65" {...accent} />
  </Figure>
)

/** The answer is built out of your own notes, and says which ones. */
const Ai = (
  <Figure>
    <rect x={22} y={22} width={58} height={34} rx={5} {...panel} />
    <Lines x={32} y={32} w={38} n={2} gap={7} />
    <rect x={22} y={66} width={58} height={34} rx={5} {...panel} />
    <Lines x={32} y={76} w={38} n={2} gap={7} />
    <Arrow x1={86} x2={108} y={40} on />
    <Arrow x1={86} x2={108} y={82} on />
    <rect x={116} y={26} width={174} height={68} rx={10} {...panel} />
    <path d="M124 94 L124 106 L138 94" {...panel} />
    <Lines x={132} y={42} w={140} n={3} gap={9} />
    <rect x={132} y={72} width={34} height={12} rx={6} fill="var(--accent)" opacity={0.28} />
  </Figure>
)

/** Notes come in as files and leave as files. */
const Import = (
  <Figure>
    <path d="M24 44 H48 L54 52 H86 V96 H24 Z" {...panel} />
    <path d="M34 66 H76 M34 76 H76 M34 86 H62" {...line} />
    <Arrow x1={94} x2={114} y={70} on />
    <rect x={122} y={32} width={78} height={76} rx={8} {...panel} />
    <Lines x={134} y={50} w={54} n={5} gap={9} />
    <Arrow x1={208} x2={228} y={70} />
    <rect x={236} y={44} width={60} height={52} rx={5} {...panel} />
    <path d="M236 60 H296" {...line} />
    <path d="M258 44 V60 M274 44 V60" {...line} />
  </Figure>
)

/** Four things the rest of the app hands you. */
const PowerTools = (
  <Figure>
    {/* command palette */}
    <rect x={20} y={34} width={64} height={52} rx={6} {...panel} />
    <rect x={30} y={52} width={44} height={16} rx={8} {...accent} />
    <path d="M38 57 V63" {...accent} />
    {/* canvas */}
    <rect x={92} y={34} width={64} height={52} rx={6} {...panel} />
    <rect x={102} y={46} width={20} height={14} rx={3} {...line} />
    <rect x={128} y={62} width={20} height={14} rx={3} {...line} />
    <path d="M122 53 L128 69" {...line} />
    {/* table */}
    <rect x={164} y={34} width={64} height={52} rx={6} {...panel} />
    <path d="M164 50 H228 M164 66 H228 M186 34 V86 M208 34 V86" {...line} />
    {/* plugin */}
    <rect x={236} y={34} width={64} height={52} rx={6} {...panel} />
    <path d="M254 48 H268 V56 A5 5 0 0 1 278 56 V48 H282 V70 H254 Z" {...line} />
  </Figure>
)

/** One note, one link, and the graph starts. */
const Finish = (
  <Figure>
    <rect x={54} y={28} width={104} height={64} rx={6} {...panel} />
    <Lines x={68} y={44} w={76} n={3} />
    <path d="M68 76 V88" {...accent} />
    <path d="M158 60 H214" {...line} strokeDasharray="3 4" />
    <circle cx={172} cy={60} r={3} fill="var(--accent)" stroke="none" />
    <circle cx={232} cy={60} r={16} {...line} strokeDasharray="3 4" />
  </Figure>
)

/**
 * Figures by card. Cards absent from this map render none — `role` and
 * `comfort` are the two question cards, whose option lists already fill the
 * space a figure would take.
 */
export const STEP_ART: Partial<Record<StepId, ReactNode>> = {
  welcome: Welcome,
  capture: Capture,
  links: Links,
  organize: Organize,
  'study-kit': StudyKit,
  'research-kit': ResearchKit,
  ai: Ai,
  import: Import,
  'power-tools': PowerTools,
  finish: Finish,
}

// Sample Checklist — a real third-party Jnana plugin, used to smoke-test the
// loader runtime. `react` is provided by the host at load time (external), so this
// bundle's components run against the app's own React instance.
import { useMemo, useState } from 'react'

interface Item {
  id: string
  text: string
  done: boolean
}
interface Data {
  items: Item[]
}

function parse(content: string): Data {
  try {
    const d = JSON.parse(content)
    if (d && Array.isArray(d.items)) return { items: d.items }
  } catch {
    /* fall through */
  }
  return { items: [] }
}
const serialize = (d: Data): string => JSON.stringify(d)
const uid = (): string => Math.random().toString(36).slice(2)

// Read view — pure render + a hook (useMemo) to prove hooks work in the View too.
function ChecklistView({ note }: { note: { content: string } }) {
  const items = parse(note.content).items
  const done = useMemo(() => items.filter((i) => i.done).length, [items])
  if (items.length === 0) return <div data-testid="empty">No items yet — switch to editing to add some.</div>
  return (
    <div data-testid="checklist-view">
      <div data-testid="progress">
        {done}/{items.length} done
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-done={i.done}>
            {i.done ? '☑' : '☐'} {i.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Edit view — useState-managed list; every change bubbles through onChange so the
// host's normal autosave persists it (exercises hooks + shared React end-to-end).
function ChecklistEditor({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [items, setItems] = useState<Item[]>(() => parse(value).items)
  const [draft, setDraft] = useState('')

  const commit = (next: Item[]) => {
    setItems(next)
    onChange(serialize({ items: next }))
  }

  return (
    <div data-testid="checklist-editor">
      {items.map((i) => (
        <label key={i.id} style={{ display: 'block' }}>
          <input
            type="checkbox"
            aria-label={i.text}
            checked={i.done}
            onChange={() => commit(items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))}
          />
          {i.text}
        </label>
      ))}
      <input aria-label="new-item" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New item" />
      <button
        onClick={() => {
          const t = draft.trim()
          if (!t) return
          commit([...items, { id: uid(), text: t, done: false }])
          setDraft('')
        }}
      >
        Add
      </button>
    </div>
  )
}

const plugin = {
  id: 'com.jnana.sample-checklist',
  name: 'Sample Checklist',
  version: '1.0.0',
  init(ctx: { registerNoteType: (def: unknown) => void }) {
    ctx.registerNoteType({
      id: 'sample-checklist',
      label: 'Checklist',
      newContent: () => serialize({ items: [] }),
      toSearchText: (n: { content: string }) => parse(n.content).items.map((i) => i.text).join('\n'),
      toExportMarkdown: (n: { content: string }) =>
        parse(n.content)
          .items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`)
          .join('\n'),
      View: ChecklistView,
      Editor: ChecklistEditor,
    })
  },
}

export default plugin

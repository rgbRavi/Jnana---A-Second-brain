## Folders & Vault (virtual file tree)

**Status:** planned · target Phase 1 polish (alongside theme switcher) · migration **v11**

### Why

Jnana's natural audience overlaps heavily with Obsidian users, so Jnana will be judged against
Obsidian's defaults. The biggest *perceived* gap isn't capability — it's familiarity: Obsidian
opens to a **folder sidebar** and a **single vault**, and migrants hesitate when that mental model
isn't there. Workspaces are more powerful (many-to-many, scoped graph/AI) but they are *not* a vault
and shouldn't be sold as one. This feature gives migrants the front door they expect, with
workspaces as the layer their old tool never had — progressive disclosure instead of a learning curve.

Folders are **virtual** (rows in SQLite, not real filesystem directories). This sidesteps an entire
class of cross-platform landmines (Windows case-insensitivity vs case-sensitive macOS, illegal
filename chars, `MAX_PATH`, reserved names like `CON`/`NUL`) and keeps the local-first DB as the
single source of truth.

### Design decisions (deliberate — don't drift)

- **Single-parent, not many-to-many.** A note lives in **exactly one** folder (or is unfiled).
  This is the invariant that *makes a folder feel like a folder* and is the whole point of importing
  the Obsidian model. Enforced at the schema level via a `folder_id` **column on `notes`**, not a
  junction table. (Junctions are for tags/collections/workspaces — the "lives in many" need is
  already covered; a folder is the "lives in one" lens.)
- **One global tree = one vault.** The whole app maps to a single Obsidian vault with one global
  folder tree. Folders are **not** scoped per workspace (that would force a `(workspace, note,
  folder)` junction and let one note sit in `/Biology` here and `/Misc` there). Workspaces remain a
  separate, additive many-to-many layer on top.
- **Folders are a view, never a container.** A note in `/Biology` still appears in its workspaces,
  collections, graph, search, and favourites unchanged. The UI must communicate this so migrants
  don't get "which is the *real* location?" anxiety.
- **Deleting a folder never deletes notes.** Per Jnana philosophy: sub-folders cascade, but a note's
  `folder_id` is `SET NULL` → it falls back to unfiled. Offer the Obsidian-flavoured choice on
  delete ("Delete folder only" vs "folder + notes"), defaulting to the safe one.

### Schema (migrate_v11)

```sql
folders (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,  -- NULL = top level
  name       TEXT NOT NULL,
  position   INTEGER,                                          -- manual order within a parent
  created_at TEXT,
  updated_at TEXT
)

-- one nullable column, NOT a junction table:
ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES notes(folder_id)
  -- → folders(id) ON DELETE SET NULL ; NULL = unfiled (shown at root)
```

Notes:
- foreign keys on; `parent_id` cascades (deleting a folder drops its sub-folders), `notes.folder_id`
  is `SET NULL` (notes survive, become unfiled)
- bump `schema_version` to **11** and update the migration test's expected version + table asserts
  in `db/schema.rs`
- the tree is tiny — load it whole (`SELECT * FROM folders`, build an adjacency list in JS); **do
  not** reach for closure tables / nested sets. Lazy-load each folder's *note list* on expand.

### Commands (commands/folders.rs)

| Command | Description |
|---|---|
| `list_folders` | Fetch the whole folder tree (flat rows; UI builds the tree) |
| `save_folder` | Upsert a folder (create / rename / reposition) |
| `delete_folder` | Delete folder (+ sub-folders cascade); contained notes → unfiled |
| `move_folder` | Reparent a folder (`parent_id`), with cycle guard |
| `set_note_folder` | Set/clear a note's `folder_id` (drag-into-folder, move, unfile) |
| `list_folder_note_ids` | Note ids directly in one folder (lazy-loaded on expand) |

### Layering & events

`folders` table → `db/queries.rs` → `commands/folders.rs` → `core/folders.ts` →
`hooks/useFolders.ts` → sidebar tree in `ui/`. UI never touches `core` directly.

New bus events (stringly-typed — no registry change): `folder:created`, `folder:renamed`,
`folder:moved`, `folder:deleted`, `note:moved`. Tree-expanded state persists via a module
store + localStorage like other UI prefs (mirror `useComposerOptions` / dashboard prefs).

### Roadmap

**Folder system**
- [ ] `migrate_v11`: `folders` table + `notes.folder_id` column; update schema test
- [ ] Rust commands (`folders.rs`) + queries; cycle guard on `move_folder`
- [ ] `core/folders.ts` wrappers (emit `folder:*` / `note:moved`)
- [ ] `useFolders` hook (tree build, expanded-state persistence)
- [ ] Sidebar folder tree: expand/collapse, right-click (new / rename / delete), unfiled root
- [ ] Drag note → folder; drag folder → folder (reparent)
- [ ] Delete-folder dialog ("folder only" vs "folder + notes"), safe default
- [ ] Optional "show folder as scope" — filter the notes list to a folder + descendants

**Vault import (the actual migration-killer)**
- [ ] Point Jnana at an Obsidian vault folder
- [ ] Mirror its directory tree → virtual `folders`
- [ ] Ingest each `.md` → a note (preserve `[[wikilinks]]` — already Jnana-native, graph rebuilds free)
- [ ] Convert `![[embeds]]` → Jnana embed tokens; copy referenced assets
- [ ] Dry-run summary (n folders, n notes, n links) before commit

**Migrant comfort (smaller wins)**
- [ ] Optional "Obsidian keymap" preset for the command palette (quick-switcher muscle memory)
- [ ] Keep workspaces/collections one click deeper by default — folders are the front door
- [ ] README note: virtual folders avoid Windows/macOS filesystem collisions (a real differentiator)

### Interactions to keep in mind

- **Markdown export (Phase 2)** — single-parent makes the virtual tree map cleanly to a real
  directory tree (`/Biology/Cells.md`), so export is instantly Obsidian-compatible. A many-to-many
  folder model literally couldn't do this without duplicating files. The export story is itself an
  argument for the single-parent design.
- **Graph / workspaces / search** are unaffected — folders are an extra lens, not a new container.
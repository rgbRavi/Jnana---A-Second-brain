# Jnana — Architecture Deep Dive

> **Jnana** (Sanskrit: ज्ञान, "knowledge") is a Tauri v2 desktop application that functions as a personal knowledge management system — a "second brain." It lets users capture notes enriched with images, videos, PDFs, YouTube embeds, and document attachments, then interconnect them via wikilinks and explore the resulting knowledge graph.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Runtime** | Tauri v2 (WebView2 on Windows) | Native desktop shell, IPC bridge, custom URI protocol |
| **Backend** | Rust | Tauri commands, asset management, file I/O, DB access |
| **Database** | SQLite (rusqlite 0.31, WAL mode) | Persistent storage with schema migrations |
| **Frontend** | React 19 + TypeScript | UI framework |
| **Build** | Vite 7 | Dev server & bundling |
| **Search** | MiniSearch | Client-side full-text search with fuzzy matching |
| **Graph** | react-force-graph-2d | Knowledge graph visualization |
| **Video** | Plyr | Rich video player with custom controls |
| **PDF** | pdfjs-dist | In-app PDF rendering with annotation overlay |
| **Styling** | Vanilla CSS with CSS custom properties | Theming system |

---

## High-Level Architecture

```mermaid
graph TB
    subgraph Desktop["Tauri Desktop Shell"]
        subgraph Frontend["React Frontend (WebView)"]
            App["App.tsx — Router & State Owner"]
            
            subgraph Views["Views"]
                NotesView["Notes View"]
                SearchView["Search View"]
                GraphView["Graph View"]
            end
            
            subgraph Hooks["React Hooks Layer"]
                useNotes["useNotes"]
                useSearch["useSearch"]
                useGraph["useGraph"]
                useAnnotations["useAnnotations"]
                useDocUpload["useDocumentUpload"]
                useAttachments["useNoteAttachments"]
                usePending["usePendingMedia"]
                usePdfAnno["usePdfAnnotations"]
            end
            
            subgraph Core["Core API Layer"]
                CoreNotes["core/notes.ts"]
                CoreSearch["core/search.ts"]
                CoreMedia["core/media.ts"]
                CoreAnno["core/annotations.ts"]
                CoreTags["core/tags.ts"]
            end
            
            subgraph Lib["Library Layer"]
                EventBus["EventBus"]
                PluginReg["PluginRegistry"]
                PluginWorker["PluginWorker"]
            end
        end
        
        subgraph Backend["Rust Backend"]
            subgraph Commands["Tauri Commands"]
                NotesCmds["notes.rs"]
                MediaCmds["media.rs"]
                AnnoCmds["annotations.rs"]
                AssetsCmds["assets.rs"]
            end
            
            subgraph DB["Database Layer"]
                Schema["schema.rs — Migrations"]
                Queries["queries.rs — SQL"]
                DBMod["mod.rs — Init & Paths"]
            end
            
            AssetProto["jnana-asset:// Protocol"]
            SQLite[(SQLite DB)]
            Assets[("assets/ dir")]
        end
    end
    
    App --> Views
    Views --> Hooks
    Hooks --> Core
    Core -->|"invoke()"| Commands
    Core --> EventBus
    Commands --> DB
    DB --> SQLite
    AssetsCmds --> Assets
    MediaCmds --> Assets
    AssetProto --> Assets
    EventBus --> PluginReg
    PluginReg --> PluginWorker
    
    style Desktop fill:#0d0d0f,stroke:#7c6af7,color:#f0eff5
    style Frontend fill:#1a1a2e,stroke:#55535f,color:#f0eff5
    style Backend fill:#16213e,stroke:#55535f,color:#f0eff5
    style SQLite fill:#2a2a35,stroke:#7c6af7,color:#f0eff5
    style Assets fill:#2a2a35,stroke:#7c6af7,color:#f0eff5
```

---

## Database Schema (ER Diagram)

The SQLite database has 5 tables managed by a versioned migration system:

```mermaid
erDiagram
    schema_version {
        INTEGER version
    }
    
    notes {
        TEXT id PK
        TEXT title
        TEXT content
        TEXT tags "JSON array"
        INTEGER created_at
        INTEGER updated_at
    }
    
    links {
        TEXT from_id PK "FK → notes.id"
        TEXT to_id PK "FK → notes.id"
    }
    
    media_refs {
        TEXT id PK
        TEXT note_id "FK → notes.id"
        TEXT media_type "pdf|video|youtube|audio|image"
        TEXT path "UUID.ext filename"
        TEXT meta "JSON metadata"
    }
    
    annotations {
        TEXT id PK
        TEXT note_id "FK → notes.id"
        TEXT media_id "FK → media_refs.id"
        TEXT kind "video_timestamp|pdf_highlight|audio_marker"
        TEXT position "JSON coordinates"
        TEXT content
        INTEGER created_at
    }
    
    notes ||--o{ links : "from_id"
    notes ||--o{ links : "to_id"
    notes ||--o{ media_refs : "note_id"
    notes ||--o{ annotations : "note_id"
    media_refs ||--o{ annotations : "media_id"
```

> [!NOTE]
> All foreign keys use `ON DELETE CASCADE` — deleting a note automatically removes its links, media_refs, and annotations. Tags are stored as a JSON array string in the `notes.tags` column and deserialized on read.

---

## Component Hierarchy

```mermaid
graph TD
    Main["main.tsx"] --> App["App.tsx"]
    
    App --> Sidebar["Sidebar (Nav)"]
    App --> MainContent["Main Content Area"]
    App --> NoteModal
    
    MainContent --> NotesView["Notes View"]
    MainContent --> SearchView["Search View"]
    MainContent --> GraphViewComp["Graph View"]
    
    NotesView --> NoteCreator
    NotesView --> NoteItemList["NoteItem[]"]
    
    NoteCreator --> TagEditor1["TagEditor"]
    NoteCreator --> DocUpload1["useDocumentUpload"]
    NoteCreator --> Attachments1["useNoteAttachments"]
    NoteCreator --> PendingMedia["usePendingMedia"]
    
    NoteItemList --> NoteItem
    NoteItem --> MarkdownLite1["MarkdownLite (read)"]
    NoteItem --> TagEditor2["TagEditor (edit)"]
    NoteItem --> DocUpload2["useDocumentUpload"]
    NoteItem --> Attachments2["useNoteAttachments"]
    
    SearchView --> SearchDocs
    SearchDocs --> useSearchHook["useSearch"]
    
    GraphViewComp --> ForceGraph2D["ForceGraph2D"]
    GraphViewComp --> SearchDocsGraph["SearchDocs (overlay)"]
    GraphViewComp --> NoteItemPanel["NoteItem (side panel)"]
    GraphViewComp --> useGraphHook["useGraph"]
    
    NoteModal --> MarkdownLite2["MarkdownLite (view)"]
    NoteModal --> TagEditor3["TagEditor"]
    NoteModal --> DocUpload3["useDocumentUpload"]
    NoteModal --> Attachments3["useNoteAttachments"]
    
    MarkdownLite1 --> AsyncImage
    MarkdownLite1 --> VideoPlayer
    MarkdownLite1 --> PdfViewer
    MarkdownLite1 --> AsyncYouTube
    
    PdfViewer --> usePdfAnnoHook["usePdfAnnotations"]
    usePdfAnnoHook --> useAnnotationsHook["useAnnotations"]
    
    style App fill:#7c6af7,stroke:#f0eff5,color:#fff
    style NoteModal fill:#5a4fcf,stroke:#f0eff5,color:#fff
    style MarkdownLite1 fill:#3d2e8f,stroke:#9896a4,color:#f0eff5
```

---

## Event Bus & Plugin Architecture

The app uses a custom in-process EventBus for decoupled communication. Plugins run in sandboxed environments with blocked core event emissions.

```mermaid
graph LR
    subgraph CoreEmitters["Core Emitters"]
        CN["core/notes.ts"]
        CA["core/annotations.ts"]
    end
    
    subgraph Bus["EventBus (Singleton)"]
        EB["eventBus"]
    end
    
    subgraph Subscribers["Subscribers"]
        UNH["useNotes"]
        UGH["useGraph"]
        USH["useSearch"]
        UAH["useAnnotations"]
    end
    
    subgraph PluginSystem["Plugin Sandbox"]
        PR["PluginRegistry"]
        PB["PluginBus (Sandboxed)"]
        WK["Web Worker"]
        WB["WorkerBus"]
    end
    
    CN -->|"note:saved"| EB
    CN -->|"note:deleted"| EB
    CN -->|"link:created"| EB
    CN -->|"link:removed"| EB
    CA -->|"annotation:created"| EB
    CA -->|"annotation:updated"| EB
    CA -->|"annotation:deleted"| EB
    
    EB -->|subscribe| UNH
    EB -->|subscribe| UGH
    EB -->|subscribe| USH
    EB -->|subscribe| UAH
    
    PR -->|creates| PB
    PB -->|safe wrapper| EB
    PR -->|spawns| WK
    WK -->|postMessage| WB
    WB -->|"emit (filtered)"| EB
    
    style Bus fill:#7c6af7,stroke:#f0eff5,color:#fff
    style PluginSystem fill:#2a2a35,stroke:#55535f,color:#f0eff5
```

### Event Catalog

| Event | Payload | Emitted By | Consumed By |
|-------|---------|------------|-------------|
| `note:saved` | `Note` | `core/notes.ts` | useNotes, useGraph, useSearch |
| `note:deleted` | `{ id }` | `core/notes.ts` | useGraph, useSearch |
| `link:created` | `{ fromId, toId }` | `core/notes.ts` | useGraph |
| `link:removed` | `{ fromId, toId }` | `core/notes.ts` | useGraph |
| `annotation:created` | `Annotation` | `core/annotations.ts` | useAnnotations |
| `annotation:updated` | `{ id, content }` | `core/annotations.ts` | useAnnotations |
| `annotation:deleted` | `{ id }` | `core/annotations.ts` | useAnnotations |
| `plugin:registered` | `{ id }` | `PluginRegistry` | — |

> [!IMPORTANT]
> **Security guardrail**: Both `PluginBus` (inline) and the worker message handler block plugins from emitting core events (`note:saved`, `note:deleted`, `link:*`, `annotation:*`). This prevents plugins from spoofing state changes.

---

## Data Flow: Note Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant NoteCreator
    participant useNotes
    participant CoreNotes as core/notes.ts
    participant CoreTags as core/tags.ts
    participant EventBus
    participant TauriIPC as Tauri IPC
    participant RustBackend as Rust Backend
    participant SQLite
    
    User->>NoteCreator: Type title + content + tags
    User->>NoteCreator: Click "Save" (or Ctrl+Enter)
    NoteCreator->>useNotes: create(title, content, id, userTags)
    
    Note over useNotes: Optimistic update — show note immediately
    useNotes->>useNotes: setNotes([note, ...prev])
    
    useNotes->>CoreTags: inferTags(note)
    CoreTags->>TauriIPC: get_media_types(noteId)
    TauriIPC->>RustBackend: invoke
    RustBackend->>SQLite: SELECT DISTINCT media_type
    SQLite-->>RustBackend: types[]
    RustBackend-->>TauriIPC: types[]
    TauriIPC-->>CoreTags: types[]
    CoreTags-->>useNotes: autoTags[]
    
    useNotes->>CoreNotes: saveNote(noteWithTags)
    CoreNotes->>TauriIPC: invoke("save_note", note)
    TauriIPC->>RustBackend: save_note command
    RustBackend->>SQLite: INSERT OR UPDATE
    SQLite-->>RustBackend: OK
    RustBackend-->>TauriIPC: saved Note
    TauriIPC-->>CoreNotes: saved Note
    CoreNotes->>EventBus: emit("note:saved", saved)
    
    Note over EventBus: Broadcast to all subscribers
    EventBus->>useNotes: handler — upsert note
    EventBus->>useNotes: handler — syncLinksForNote
    
    Note over useNotes: Parse [[wikilinks]] → sync DB links
```

---

## Media & Asset Pipeline

```mermaid
flowchart TD
    subgraph Upload["Upload Flow"]
        IMG["📷 Image Upload"]
        VID["🎬 Video Upload"]
        DOC["📄 Document Upload"]
        YT["▶️ YouTube Embed"]
    end
    
    subgraph Processing["Processing"]
        IMG -->|"File.arrayBuffer()"| SaveAsset["save_asset (Rust)"]
        SaveAsset -->|"UUID.ext"| AssetsDir[("assets/ directory")]
        
        VID -->|"OS file dialog"| ImportMedia["import_media (Rust)"]
        ImportMedia -->|"fs::copy → UUID.ext"| AssetsDir
        
        DOC -->|"PDF direct"| ImportMedia
        DOC -->|"DOCX → PDF"| ConvertPDF["convert_to_pdf (Rust)"]
        ConvertPDF -->|"LibreOffice / Pandoc"| ImportMedia
        DOC -->|"Extract text"| ExtractText["extract_text (Rust)"]
        ExtractText -->|"Pandoc -t plain"| InlineContent["Inline to note content"]
        DOC -->|"Link external"| ExternalLink["Store in assets, link via external://"]
        
        YT -->|"Parse video ID"| InlineYT["Inline markdown: ![youtube](url)"]
    end
    
    subgraph Registration["Media Registration"]
        ImportMedia -->|"After note saved"| RegisterRef["register_media_ref (Rust)"]
        SaveAsset -->|"After note saved"| RegisterRef
        RegisterRef -->|"INSERT media_refs"| DB[(SQLite)]
    end
    
    subgraph Serving["Asset Serving"]
        AssetsDir -->|"jnana-asset:// protocol"| URIHandler["Rust URI Scheme Handler"]
        URIHandler -->|"Range header support"| Streaming["HTTP 206 Partial Content"]
        URIHandler -->|"Full file"| FullResp["HTTP 200"]
        Streaming --> WebView["WebView Rendering"]
        FullResp --> WebView
    end
    
    subgraph PendingFlow["Draft Note Flow (NoteCreator)"]
        direction LR
        P1["addPendingMedia()"] --> P2["Ref array stores {filename, type}"]
        P2 -->|"On save"| P3["flushPendingMedia(noteId)"]
        P3 --> RegisterRef
    end
    
    style AssetsDir fill:#2a2a35,stroke:#7c6af7,color:#f0eff5
    style DB fill:#2a2a35,stroke:#7c6af7,color:#f0eff5
```

> [!TIP]
> The `jnana-asset://` custom URI protocol handler in Rust supports **HTTP 206 Partial Content** with Range headers, enabling smooth video seeking without downloading the entire file. This is critical for the Plyr-based video player.

---

## Search Architecture

```mermaid
flowchart LR
    subgraph Index["Client-Side Index"]
        Notes["Note[]"] -->|"addAllAsync()"| MiniSearch["MiniSearch Index"]
        MiniSearch -->|"Fields: title (3x), tags (2x), content (1x)"| Ranked["Ranked Results"]
    end
    
    subgraph Hooks["Hook Layer"]
        useSearchHook["useSearch(notes)"]
        useSearchHook -->|"builds on mount"| MiniSearch
        useSearchHook -->|"incremental update"| Updates["updateIndexedNote / removeIndexedNote"]
    end
    
    subgraph Sync["Real-time Sync"]
        EB["EventBus"]
        EB -->|"note:saved"| Updates
        EB -->|"note:deleted"| Updates
    end
    
    subgraph UI["UI Layer"]
        SearchDocs["SearchDocs Component"]
        SearchDocs -->|"query"| useSearchHook
        useSearchHook -->|"SearchResult[]"| SearchDocs
        SearchDocs -->|"onOpenNote"| NoteModal["NoteModal"]
    end
    
    subgraph Features["Search Features"]
        F1["Prefix matching"]
        F2["Fuzzy matching (0.1 threshold)"]
        F3["Boosted fields (title > tags > content)"]
        F4["Async chunked indexing (200 docs/chunk)"]
    end
    
    style MiniSearch fill:#7c6af7,stroke:#f0eff5,color:#fff
```

---

## Annotation System

```mermaid
flowchart TD
    subgraph Kinds["Annotation Kinds"]
        VT["video_timestamp"]
        PH["pdf_highlight"]
        AM["audio_marker"]
    end
    
    subgraph Position["Position Encoding (JSON)"]
        VT -->|"{'seconds': 125}"| PosJSON["Stored as TEXT"]
        PH -->|"{'page': 3, 'rect': [x,y,w,h]}"| PosJSON
        AM -->|"{'seconds': 42}" | PosJSON
    end
    
    subgraph Hooks2["React Hooks"]
        UANote["useAnnotations(noteId)"]
        UAMedia["useMediaAnnotations(mediaId)"]
        UAPdf["usePdfAnnotations(noteId, mediaId, page)"]
        UAPdf --> UANote
    end
    
    subgraph Writers["Annotation Factories"]
        MakeVideo["makeVideoAnnotation()"]
        MakePdf["makePdfAnnotation()"]
        MakeAudio["makeAudioAnnotation()"]
    end
    
    subgraph Backend2["Rust Backend"]
        SaveAnno["save_annotation"]
        SaveAnno -->|"Ensures media_ref FK exists"| MediaRefGuard["INSERT OR IGNORE media_refs"]
        MediaRefGuard --> InsertAnno["INSERT annotations"]
    end
    
    PosJSON --> Backend2
    Writers --> UANote
    UANote -->|"invoke"| Backend2
    
    style PosJSON fill:#2a2a35,stroke:#55535f,color:#f0eff5
```

---

## Auto-Tagging Pipeline

```mermaid
flowchart LR
    subgraph MediaTags["Media-Based Tags (from DB)"]
        MT1["has:media"]
        MT2["has:image"]
        MT3["has:video"]
        MT4["has:youtube"]
        MT5["has:audio"]
        MT6["has:pdf"]
        MT7["has:videoOrYt"]
    end
    
    subgraph ContentTags["Content-Based Tags (regex)"]
        CT1["has:link — https://"]
        CT2["has:wikilink — double brackets"]
        CT3["has:docxlink — external://"]
        CT4["long-form — >1000 words"]
    end
    
    subgraph Flow["Tag Flow"]
        Note["Note"] --> InferTags["inferTags(note)"]
        InferTags -->|"DB query"| MediaTypes["getMediaTypes(noteId)"]
        InferTags -->|"Regex scan"| ContentScan["Content analysis"]
        MediaTypes --> AutoTags["Auto tags (has:* prefix)"]
        ContentScan --> AutoTags
        AutoTags --> Merge["Merge: [...autoTags, ...userTags]"]
        UserTags["User-defined tags"] --> Merge
        Merge --> SavedNote["Saved to DB"]
    end
    
    subgraph Guard["Tag Guards"]
        IsAuto["isAutoTag() — filters has:* and long-form"]
        IsAuto -->|"User cannot delete auto-tags"| TagEditor["TagEditor UI"]
        IsAuto -->|"Auto-tags shown as read-only chips"| TagEditor
    end
```

---

## Wikilink & Knowledge Graph

```mermaid
flowchart TD
    subgraph Parsing["Wikilink Parsing"]
        Content["Note content"] -->|"Match all double bracket refs"| Parse["Regex: /\\[\\[.*?\\]\\]/g"]
        Parse --> Titles["Set of linked titles"]
    end
    
    subgraph Resolution["Link Resolution"]
        Titles --> Resolve["Match title → note ID"]
        Resolve -->|"Skip self-links"| TargetIDs["Target ID set"]
    end
    
    subgraph Sync2["DB Sync (syncLinksForNote)"]
        TargetIDs --> Compare["Compare with outbound links in DB"]
        Compare -->|"In content, not in DB"| CreateLink["createLink()"]
        Compare -->|"In DB, not in content"| RemoveLink["removeLink()"]
        CreateLink -->|"emit"| LinkCreated["link:created event"]
        RemoveLink -->|"emit"| LinkRemoved["link:removed event"]
    end
    
    subgraph GraphViz["Graph Visualization"]
        LinkCreated --> UseGraph["useGraph hook"]
        LinkRemoved --> UseGraph
        UseGraph --> ForceGraph["ForceGraph2D"]
        ForceGraph -->|"Click node"| FocusMode["Focus Mode — show neighbors"]
        ForceGraph -->|"Hover"| Tooltip["Rich tooltip with preview"]
        FocusMode --> SidePanel["Side Panel — edit note inline"]
    end
    
    style ForceGraph fill:#7c6af7,stroke:#f0eff5,color:#fff
```

---

## MarkdownLite Rendering Pipeline

The custom `MarkdownLite` component is a rich-content renderer that parses note content and renders embedded media inline:

```mermaid
flowchart TD
    Content["Raw note content string"] --> ImageRegex["Match ![alt](url)"]
    Content --> LinkRegex["Match [text](external://...)"]
    Content --> TSRegex["Match [V1::MM:SS] timestamps"]
    Content --> SimpleTS["Match [MM:SS] simple timestamps"]
    Content --> DocPage["Match [D1::Page N] page jumps"]
    
    ImageRegex -->|"alt=video"| VideoPlayer["VideoPlayer (Plyr)"]
    ImageRegex -->|"alt=pdf"| PdfViewer["PdfViewer (pdfjs)"]
    ImageRegex -->|"alt=youtube"| AsyncYouTube["AsyncYouTube (iframe)"]
    ImageRegex -->|"jnana-asset://"| AsyncImage["AsyncImage"]
    ImageRegex -->|"http(s)://"| ImgTag["Native img element"]
    
    LinkRegex --> ExternalBtn["Open in App button (Tauri opener)"]
    
    TSRegex --> SeekBtn["Timestamp button → seek video"]
    SimpleTS --> SeekBtn
    DocPage --> PageJumpBtn["Page jump button → setPage"]
    
    VideoPlayer -->|"onReady"| PlyrRef["playerRefs Map"]
    AsyncYouTube -->|"onReady"| YTRef["youtubeRefs Map"]
    PdfViewer -->|"onRegisterPageSetter"| PdfRef["pdfPageSetters Map"]
    
    SeekBtn -->|"click"| PlyrRef
    SeekBtn -->|"click"| YTRef
    PageJumpBtn -->|"click"| PdfRef
    
    style Content fill:#2a2a35,stroke:#7c6af7,color:#f0eff5
```

---

## File Layout

```
Jnana---A-Second-brain/
├── src/                          # React Frontend
│   ├── main.tsx                  # React DOM mount
│   ├── App.tsx                   # Root component, state owner, router
│   ├── App.css                   # Global styles + CSS custom properties
│   ├── types/
│   │   └── index.ts              # Note, Link, MediaRef, Annotation, Plugin, AppEvent
│   ├── core/                     # Tauri IPC wrappers + business logic
│   │   ├── notes.ts              # CRUD + links + assets + wikilink sync
│   │   ├── search.ts             # MiniSearch index management
│   │   ├── media.ts              # Import, convert, register media
│   │   ├── annotations.ts        # Annotation CRUD + factory helpers
│   │   └── tags.ts               # Auto-tag inference (media + content)
│   ├── hooks/                    # React state management
│   │   ├── useNotes.ts           # Global note state + optimistic updates
│   │   ├── useSearch.ts          # Search index + query state
│   │   ├── useGraph.ts           # Graph data (nodes + edges) via events
│   │   ├── useAnnotations.ts     # Per-note and per-media annotation state
│   │   ├── useDocumentUpload.ts  # Doc upload flow (PDF/DOCX/ODT)
│   │   ├── useNoteAttachments.ts # Image & video attachment handlers
│   │   ├── usePendingMedia.ts    # Deferred media_ref registration for drafts
│   │   └── usePdfAnnotations.ts  # PDF-specific highlight + page filtering
│   ├── lib/                      # Infrastructure
│   │   ├── eventBus.ts           # EventBus + PluginBus (sandboxed)
│   │   ├── pluginRegistry.ts     # Plugin lifecycle (inline + worker)
│   │   ├── pluginWorker.ts       # Worker-side bus client
│   │   └── eventBus.test.ts      # Tests for event bus security
│   ├── ui/                       # React components
│   │   ├── editor/
│   │   │   ├── NoteCreator.tsx   # New note composer
│   │   │   ├── NoteItem.tsx      # Note card (view/edit modes)
│   │   │   └── MarkdownLite.tsx  # Rich content renderer (media, timestamps, links)
│   │   ├── graph/
│   │   │   └── GraphView.tsx     # Force-directed knowledge graph
│   │   ├── media/
│   │   │   ├── VideoPlayer.tsx   # Plyr-based video (lazy, streaming)
│   │   │   └── PdfViewer.tsx     # pdfjs canvas + annotation overlay
│   │   ├── AsyncImage.tsx        # Lazy-loaded image via custom protocol
│   │   ├── AsyncVideo.tsx        # Simple lazy video element
│   │   ├── AsyncYouTube.tsx      # YouTube iframe embed (offline-aware)
│   │   ├── NoteModal.tsx         # Full-screen note viewer/editor
│   │   ├── SearchDocs.tsx        # Search UI with result cards
│   │   └── TagEditor.tsx         # Tag input (auto vs user tag chips)
│   └── themes/
│       └── default.css           # CSS custom property definitions
│
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── main.rs               # Tauri builder, URI handler, command registration
│   │   ├── lib.rs                # Mobile entry point (unused)
│   │   ├── commands/
│   │   │   ├── mod.rs            # Module declarations
│   │   │   ├── notes.rs          # Note/Link CRUD commands + asset cleanup
│   │   │   ├── media.rs          # import, convert_to_pdf, extract_text, register
│   │   │   ├── annotations.rs    # Annotation CRUD with FK guard
│   │   │   └── assets.rs         # Binary blob save/get/path
│   │   └── db/
│   │       ├── mod.rs            # init_db, data_dir, assets_dir
│   │       ├── schema.rs         # Versioned migrations (currently V1)
│   │       └── queries.rs        # All SQL operations
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Window, CSP, bundle config
│
├── package.json                  # Frontend dependencies
├── vite.config.ts                # Vite + React plugin
└── tsconfig.json                 # TypeScript config
```

---

## Key Design Patterns

### 1. Optimistic Updates
Every mutation (create, update, delete) applies the change to React state **before** the Rust backend confirms. The EventBus `note:saved` handler reconciles if another part of the app also triggers a save.

### 2. Single State Owner
`App.tsx` owns the `useNotes()` instance. It passes `create`, `update`, `remove` callbacks down to all views. `GraphView` never instantiates its own `useNotes()` — it uses `useGraph()` for graph-specific data and delegates mutations upward.

### 3. Deferred Media Registration
`NoteCreator` uses `usePendingMedia` to queue media_ref registrations. Since the note doesn't exist in the DB until save, media files are copied to `assets/` immediately but the FK-dependent `media_refs` row is only written after `save_note` succeeds.

### 4. Event-Driven Decoupling
The `EventBus` acts as a global pub/sub system. Core modules emit events; hooks subscribe. This keeps hooks independent — `useGraph`, `useSearch`, and `useNotes` all react to `note:saved` without knowing about each other.

### 5. Plugin Sandboxing
Plugins get a `PluginBus` that wraps the real `EventBus` with two guards:
- **Blocked emissions**: Plugins cannot emit core events (prevents state spoofing)
- **Error isolation**: Plugin handlers are wrapped in try/catch so crashes don't propagate

Worker plugins communicate via `postMessage` with the same emission filtering.

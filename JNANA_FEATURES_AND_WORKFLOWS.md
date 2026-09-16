# Jnana Feature Inventory and Workflow Guide

This document summarizes the Jnana features available in the app today, based on the product docs and implementation in the repository. Each feature has two lines:

- **Built:** the small technical implementation note.
- **User:** the common, user-understandable value line.

Use this as product-promotion source copy, onboarding material, release notes, or a checklist for screenshots and demos.

## Product Promise

Jnana is a local-first desktop second brain for students, researchers, and independent knowledge workers. It stores notes, media, connections, workspaces, AI history, themes, plugins, and backups on the user's machine using Tauri, React, Rust, and SQLite.

**Promotional line:** Keep your notes, PDFs, media, graph, and AI study tools together in a private desktop knowledge base you can take with you.

**Source anchors:** `README.md`, `PRODUCT.md`, `CLAUDE.md`, `src/App.tsx`, `src/AppLayout.tsx`, `src-tauri/src/main.rs`, `src-tauri/src/db/schema.rs`.

## 1. Local-First Desktop Foundation

### Private Local Storage

**Built:** Notes and app data persist in SQLite via Rust `rusqlite`; files are copied into an app-managed assets directory and served through `jnana-asset://`.

**User:** Your knowledge base lives on your computer, works offline, and is not uploaded unless you choose an external AI provider.

**Workflow example:** A student can import lecture PDFs, record audio, annotate readings, and revise notes on a train or in a classroom with no internet connection.

### Native Desktop Shell

**Built:** Tauri v2 wraps the React app and exposes Rust commands for files, database operations, dialogs, asset serving, media conversion, AI proxying, export, backup, and plugin loading.

**User:** Jnana feels like a real desktop app while keeping the speed and flexibility of a modern web UI.

### Safe Asset Protocol

**Built:** The custom `jnana-asset://` protocol validates filenames, rejects traversal, reflects CORS only for app origins, and supports byte ranges for video seeking.

**User:** Imported files stay linked and usable inside notes, even if the original file moves.

### Recoverable Startup and Migrations

**Built:** SQLite migrations are versioned to schema v21 and run transactionally; failed database startup shows a recoverable native dialog instead of a raw crash.

**User:** Upgrades are designed to protect your notes and avoid half-applied database changes.

## 2. App Navigation and Core Surfaces

### Main Views

**Built:** The router exposes Home, Notes, Graph, Search, AI, Workspaces, Settings, and Trash; heavier routes are lazy-loaded.

**User:** Everything has a clear place: capture on Home, organize in Notes and Workspaces, explore in Graph, retrieve in Search, and study with AI.

### Persistent Last Route

**Built:** `AppLayout` stores the last route and restores it depending on General Settings startup preference.

**User:** Jnana opens where you left off, so a focused study or writing session can continue immediately.

### Global Command Palette

**Built:** `CommandPalette` uses MiniSearch and plugin contribution registries to jump to notes, switch workspaces, open routes, create typed notes, and run commands.

**User:** Press Ctrl/Command-K and go anywhere without hunting through sidebars.

**Workflow example:** Type "graph" to open the graph, type a workspace name to switch projects, or search a note title and open it straight into Working Notes.

### Keyboard Shortcut for Working Notes

**Built:** Ctrl/Command+Shift+E toggles the Working Notes desk from anywhere.

**User:** One shortcut turns Jnana into a focused writing desk.

## 3. Notes and Capture

### Note Creation and Editing

**Built:** Notes are created, updated, soft-deleted, and restored through `useNotes`, `core/notes.ts`, and Rust note commands with optimistic UI updates.

**User:** Capture thoughts quickly, edit them immediately, and trust that they persist across restarts.

### Floating Composer

**Built:** `NoteCreator` appears on capture-oriented surfaces and is suppressed on Working Notes and Canvas where those surfaces own their editor experience.

**User:** A quick note is always nearby without covering specialized work areas.

### Note Cards and Gallery

**Built:** Notes render in a gallery with memoized cards, preview truncation, lazy embeds, incremental rendering, and view preferences.

**User:** Browse a growing note library without the interface slowing down or feeling crowded.

### Peek Modal

**Built:** `NoteModal` opens a read-focused view from Home, Search, AI, Canvas, Graph, and Workspaces, with an expand toggle and "Edit in Working Notes" handoff.

**User:** Quickly inspect a note from anywhere, then jump into the editor only when you need to change it.

### Trash and Restore

**Built:** Deleting notes sets `notes.deleted_at`; Trash can restore, permanently delete, empty, or purge old notes using retention settings.

**User:** Deleted notes are recoverable, so cleanup is less scary.

## 4. Notes Organization

### Tags

**Built:** Tags are stored on notes, edited through `TagEditor`, and supplemented by automatic tags from `core/tags.ts`.

**User:** Organize notes manually or let Jnana identify notes with media, PDFs, links, tables, and long-form content.

### Automatic Tags

**Built:** Auto-tags include media/content states such as `has:image`, `has:pdf`, `has:audio`, `has:webpage`, `has:table`, `has:wikilink`, and `long-form`.

**User:** Filter for "all notes with PDFs" or "long-form notes" without maintaining those tags yourself.

### Favourites

**Built:** Favourite note IDs are stored separately and surfaced in notes, dashboards, and quick access flows.

**User:** Star the notes you return to most and keep them close.

### Folders

**Built:** The file explorer renders a tree from `folders`, supports expansion state, and scopes folders to the active vault.

**User:** Keep notes in familiar nested folders when a graph alone is too loose.

### Vaults

**Built:** The file explorer owns vault switching, creation, rename, and delete; the active vault scopes notes, folders, search, and RAG retrieval.

**User:** Separate different knowledge bases, such as school, research, personal, or work.

**Workflow example:** Keep a "Semester 1" vault for classes, a "Research" vault for papers, and switch between them without cross-contaminating search or AI answers.

## 5. Notes Gallery Filtering and Sorting

### Search Within Notes View

**Built:** Notes view has its own text search and preferences separate from global Search.

**User:** Narrow the current library view while staying in the note gallery.

### Sort Modes

**Built:** Sort options include updated time, created time, title, length, and link count, with ascending/descending toggle.

**User:** Sort notes by what matters in the moment: recent work, oldest material, title, depth, or connectedness.

### Display Modes

**Built:** View preferences include card, comfortable, compact, and grid modes.

**User:** Switch between visual browsing and dense scanning.

### Filter Bar

**Built:** Filters include date windows, size buckets, status chips, include/exclude tag chips, and persisted preferences.

**User:** Find exactly the slice you need, such as last week's long notes with PDFs but no links.

## 6. Markdown, Editor, and Writing Tools

### Live Markdown Editor

**Built:** The CodeMirror-based `LiveEditor` hides or styles markdown syntax while preserving raw markdown near the cursor for editing.

**User:** Write in markdown without feeling like you are staring at syntax all day.

### Markdown Rendering

**Built:** `MarkdownLite` uses `react-markdown`, `remark-gfm`, `remarkBreaks`, and `remarkJnana` for headings, lists, task lists, tables, code, wikilinks, timestamps, colors, media, and custom tables.

**User:** Notes look polished in read mode while staying portable as text.

### Formatting Toolbar

**Built:** `FormatToolbar` and `ComposerToolbar` call editor handles for bold, italic, headings, lists, quote, code, links, colors, highlights, tables, and imports.

**User:** Apply formatting without memorizing every markdown shortcut.

### Right-Click Editor Menu

**Built:** The editor uses a portaled context menu for formatting, cut/copy/paste, paste plain text, media import, table insertion, and color/highlight controls.

**User:** Common editing actions are available exactly where you are writing.

### Slash Command Menu

**Built:** `detectSlashContext`, `SlashMenu`, and the action registry insert content or apply formatting from real typed `/query` text.

**User:** Type `/` to insert a table, divider, link, embed, or formatting action without leaving the keyboard.

### Wikilink Autocomplete

**Built:** `detectWikilinkContext` and `WikilinkMenu` detect `[[query` and insert existing or unresolved note links.

**User:** Link notes as fast as you can type the idea.

### Text Color and Highlight

**Built:** Text color and highlight use portable `[c:name]...[/c]` and `[h:name]...[/h]` tokens, shared by the editor, renderer, slash menu, and context menu.

**User:** Mark important passages with color while keeping notes exportable.

### Single-Enter Line Breaks

**Built:** `remarkBreaks` turns ordinary newlines into visible line breaks outside code.

**User:** Press Enter and see a new line, just like in familiar note apps.

## 7. Tables

### Editable Note Tables

**Built:** Jnana tables are ` ```table ` CSV fences rendered as inline editable grids through CodeMirror block widgets and pure helpers in `core/table.ts`.

**User:** Add structured information to notes without opening a spreadsheet app.

### Table Insertion

**Built:** `TableSizePicker` inserts a rows-by-columns table at the cursor from the toolbar, add menu, slash menu, or context menu.

**User:** Pick a table size visually and start typing.

### Spreadsheet Paste

**Built:** The editor parses TSV from spreadsheets and GFM pipe tables into table cells.

**User:** Paste from Excel, Google Sheets, or markdown and continue editing inline.

### Table Structure Editing

**Built:** Users can type cells, add/delete rows and columns, insert between rows/columns, reorder rows/columns, resize columns/rows, scale the table, set header color, and delete tables.

**User:** Shape a study matrix, comparison chart, rubric, or reading tracker inside the note.

### Table Tools Rail

**Built:** `RightRail` and `TableToolPanel` target the focused table through `activeTable` and provide sort, move, insert/delete, align, transpose, aggregate footer, copy CSV, and export CSV.

**User:** Power tools stay out of the way until a table is active.

### Table Export

**Built:** Markdown export converts ` ```table ` blocks to portable GFM pipe tables and CSV export writes through a native Save-As flow with progress toast.

**User:** Tables can leave Jnana cleanly for GitHub, Obsidian, VS Code, or CSV workflows.

**Workflow example:** Build a "paper comparison" table with columns for method, dataset, limitation, and next action; sort it by priority, export CSV for sharing, and keep the richer version in your research note.

## 8. Working Notes Desk

### Tabbed Editor Desk

**Built:** Working Notes stores a recursive layout tree of tab groups and split panes in `views/notes/working/layout.ts`, with localStorage persistence and reconciliation.

**User:** Open several notes like a real writing desk instead of bouncing between cards.

### Split Panes

**Built:** Groups split horizontally or vertically, resize by pointer, and move tabs between panes.

**User:** Edit lecture notes beside a reading summary, or write an essay while referencing source notes.

### Autosave

**Built:** `EditorPane` debounces saves while editing and stores reading progress.

**User:** Keep writing without manually saving every paragraph.

### Restored Desk

**Built:** Tabs, splits, active subview, and route restoration persist between sessions.

**User:** Close Jnana mid-project and come back to the same arrangement.

## 9. Wikilinks and Knowledge Graph

### Wikilinks

**Built:** `[[Title]]` links are parsed in TypeScript and synchronized by Rust `sync_links`, which diffs outbound links in SQLite.

**User:** Connect ideas naturally by writing note titles in double brackets.

### Graph View

**Built:** `GraphView` uses note/link data with force-directed layout, event-driven updates, filters, display settings, and graph force controls.

**User:** See how your knowledge is connected instead of searching a flat list.

### Focus Mode

**Built:** The graph can focus a selected note and its neighbors.

**User:** Zoom into one concept and see its immediate context.

### Connect Mode

**Built:** Graph connect actions append durable `[[wikilink]]` text to the source note, letting normal link sync create the edge.

**User:** Draw a connection visually and Jnana writes the real note link for you.

### Pseudo-Nodes

**Built:** Unresolved `[[wikilinks]]` render as faded pseudo-nodes derived from note content; clicking creates the missing note and resyncs references.

**User:** Sketch future ideas now and fill them in later.

### Graph Controls

**Built:** Graph controls include search, text/date/tag filters, orphan view, custom groups by tag/title, arrows, hub/orphan highlighting, pinning, text fade, node sizing, link thickness, animation, and force presets.

**User:** Turn a messy note network into a readable map for exploration or presentation.

**Workflow example:** After a week of biology notes, filter the graph to `#cellular-respiration`, find orphan concepts, create missing notes from pseudo-nodes, and connect weakly linked material before studying.

## 10. Search and Retrieval

### Keyword Search

**Built:** `useSearch` builds a MiniSearch index over note title, tags, note-type search text, content, and extracted attachment text.

**User:** Search notes by title, tag, or phrase and open results in the peek modal.

### AI Semantic Search

**Built:** `AiSearchDocs` and `retrieve` use embeddings stored in SQLite and Rust cosine search, scoped by active vault and optional workspace.

**User:** Ask for ideas by meaning, even when you do not remember the exact words.

### PDF Text Search

**Built:** `usePdfTextIndex` extracts PDF attachment text with pdf.js, stores it in `attachment_text`, and feeds keyword and AI search.

**User:** Find a phrase buried inside an attached PDF without opening every file.

### Workspace Search Scope

**Built:** `ScopeBar`, `useScopedNoteIds`, and `setRetrievalScope` constrain Search and AI retrieval to all notes or a selected workspace.

**User:** Search the whole vault or only the project you are working on.

## 11. Workspaces

### Workspace Groups

**Built:** Workspaces are many-to-many note groups stored in `workspaces` and `workspace_notes`; removing a note from a workspace does not delete it.

**User:** Group notes by course, paper, project, client, or writing effort without duplicating them.

### Workspace Dashboard

**Built:** Each workspace has a scoped dashboard with stats, pinned/recent notes, continue/import sections, and quick actions.

**User:** Start a project from a focused command center.

### Workspace Notes

**Built:** Workspace Notes reuses the full notes toolbar and preferences keyed per workspace.

**User:** Browse only the notes that belong to one project while keeping the same familiar controls.

### Workspace Graph

**Built:** Workspace Graph passes scoped note IDs into the same graph component with a workspace-specific instance key.

**User:** See only the connections inside one class, project, or research area.

### Workspace Canvas

**Built:** Workspace Canvas lists and opens named canvases stored in SQLite as JSON Canvas documents.

**User:** Build visual maps for each workspace.

### Workspace Insights

**Built:** Insights identify orphans, untagged notes, indexing needs, and suggested links.

**User:** See what needs attention before a study session or project review.

### Collections

**Built:** Collections are lightweight subgroups inside workspaces with their own note membership.

**User:** Slice a course workspace into lectures, assignments, exam prep, and readings.

### Workspace Pinning and Sidebar State

**Built:** Active, open, and pinned workspaces are stored and rendered in the sidebar.

**User:** Keep active projects one click away.

**Workflow example:** Create a "Cognitive Science 301" workspace, add lecture notes and PDFs, pin it, make collections for "Exam 1" and "Research Paper", then study from the workspace dashboard and graph.

## 12. Canvas

### Freeform Spatial Board

**Built:** Canvas uses a hand-rolled pointer-event board with pan, zoom, drag, resize, selection, and JSON Canvas persistence.

**User:** Arrange ideas visually on a flexible board.

### Canvas Nodes

**Built:** Canvas supports note cards, text cards, media/image nodes, and web page nodes.

**User:** Mix source notes, rough thoughts, visuals, and references in one space.

### Canvas Drawing

**Built:** Freehand ink uses `perfect-freehand` and shared drawing infrastructure.

**User:** Sketch, circle, underline, and diagram directly on the board.

### Canvas Edges

**Built:** Edges connect nodes, and note-to-note edges can be promoted to real `[[wikilinks]]`.

**User:** Draw relationships first, then turn important ones into durable knowledge-graph links.

### Multiple Canvases

**Built:** Each workspace can hold multiple named canvases with create, rename, delete, and save commands.

**User:** Keep separate maps for brainstorming, essay planning, exam review, and research synthesis.

**Workflow example:** Drop your notes for a literature review onto a canvas, draw clusters by theme, add a web page reference, promote key note links into the graph, then use the graph to find missing connections.

## 13. Media-Native Notes

### Images

**Built:** Images are imported to assets, embedded in markdown, rendered lazily, shown in the editor, and opened in a lightbox-style read experience.

**User:** Keep diagrams, screenshots, slides, and visual references inside your notes.

### Local Video

**Built:** Videos stream through `jnana-asset://` with range support and Plyr-based playback.

**User:** Watch local lectures or clips inside the note and seek smoothly.

### Audio

**Built:** Audio files import as assets; audio embeds render players and support timestamp markers.

**User:** Keep lecture recordings next to the notes they explain.

### Voice Recording

**Built:** `VoiceRecorder` records from the microphone and inserts audio into notes through the composer flow.

**User:** Capture spoken thoughts or lectures without leaving Jnana.

### YouTube

**Built:** YouTube embeds use privacy-enhanced `youtube-nocookie` URLs and offline placeholder behavior.

**User:** Save video references in notes without opening a separate browser tab.

### Web Page Embeds

**Built:** `![webpage](url)` fetches and caches Open Graph/title metadata through Rust, renders a preview card, and offers a live iframe view when possible.

**User:** Keep web sources visible and contextual.

### Clickable Timestamps

**Built:** `[V0::HH:MM:SS]`, `[A0::HH:MM:SS]`, and related timestamp tokens map to document-order media players.

**User:** Jump from a note sentence directly to the exact moment in a lecture or recording.

### Media Resize and Alignment

**Built:** `ResizableMediaFrame` stores sizes and alignment separately in `note_media_layout`, keyed by stable media keys.

**User:** Resize and align images, PDFs, video, audio, and embeds without cluttering markdown.

### Media Drag Arrangement

**Built:** Live editor media drag derives the media token by key and rewrites markdown layout to place embeds left/right or above/below.

**User:** Put images side by side or stack them visually with drag-and-drop.

**Workflow example:** Import a lecture video, write notes with timestamps, add screenshots beside explanations, and resize the key diagram so the note reads like a study guide.

## 14. PDFs and Documents

### PDF Embeds

**Built:** PDFs render thumbnails in cards and a full pdf.js viewer in a portal.

**User:** Preview or open readings directly from the note.

### PDF Viewer

**Built:** `PdfViewer` supports page navigation, zoom, fit controls, selection, highlight, pen, eraser, and text tools.

**User:** Read and mark up PDFs without switching apps.

### PDF Annotations

**Built:** Highlights, ink, and text boxes are stored as overlay annotations in PDF point-space through `annotations` commands.

**User:** Your marks stay aligned across zoom levels while the original PDF remains untouched.

### PDF Text Boxes

**Built:** Text boxes auto-contrast sampled page background and can be moved, edited, or colored.

**User:** Add readable notes directly on the page.

### Document Import

**Built:** `useDocumentUpload` and Rust media commands import PDFs directly, convert DOC/DOCX/ODT to PDF, extract text with Pandoc, and copy external files to assets.

**User:** Bring class handouts, research papers, and documents into your notebook.

### Spreadsheet/Data Import

**Built:** CSV/XLSX/XLS can be read as CSV and inserted as editable Jnana tables or linked as external files.

**User:** Turn small datasets into note tables or keep large files as openable attachments.

### External File Chips

**Built:** External document chips point to copied assets and open via Tauri opener.

**User:** Attach files once and open them later even if the original was moved.

**Workflow example:** Import a research PDF, highlight key claims, write margin notes as text boxes, extract searchable PDF text, and ask AI to quiz you on the notes that cite that paper.

## 15. Voice Transcription

### Background Transcription Queue

**Built:** `TranscriptionContext` queues jobs, calls Rust `transcribe_audio`, and splices completed transcripts after the audio embed.

**User:** Turn recordings into searchable, studyable text while you continue working.

### Cloud or Local Whisper

**Built:** Transcription targets an OpenAI-compatible backend; the repo includes a FastAPI/faster-whisper Docker server for local use.

**User:** Choose cloud convenience or local/offline transcription.

### Sidebar Progress

**Built:** Background task state appears in the app-wide UI and expires completed/error entries.

**User:** Long lectures can transcribe in the background without blocking the editor.

## 16. AI Providers and Local RAG

### Optional AI Layer

**Built:** AI is disabled until configured in Settings and supports OpenAI-compatible endpoints or Ollama by capability.

**User:** Use AI only when you choose, with either cloud models or local models.

### Separate Providers Per Capability

**Built:** Chat, embeddings, transcription, and deep research have separate provider/model/base URL settings.

**User:** Mix local embeddings with cloud chat, or keep everything local where possible.

### Rust-Side Keys and Proxy

**Built:** API keys live in Rust-side config and requests go through Rust `ai_request` / `ai_chat_stream`; keys are write-only to the WebView.

**User:** Provider secrets are not stored in browser-accessible frontend state.

### Local Vector Store

**Built:** Notes are chunked, embedded, stored as f32 blobs in SQLite, and searched by Rust cosine similarity.

**User:** Semantic search and grounded AI work over your local note collection without a separate vector database.

### Index Staleness

**Built:** Index times are compared with note update times to identify stale notes and offer re-indexing.

**User:** Jnana tells you when AI needs a refresh after note edits.

## 17. AI Chat and Study Tools

### Streaming Chat

**Built:** AI chat streams tokens over a Tauri Channel, supports cancellation, and keeps in-flight state in `useViewState`.

**User:** Chat responses appear live, can be stopped, and survive view switches.

### Chat History

**Built:** Conversations persist to SQLite with list/load/rename/delete operations and a collapsible history drawer.

**User:** Your study chats are saved like part of your knowledge workflow.

### Attachments in Chat

**Built:** Attachments can be images, documents, audio, files, or Jnana notes; images route to vision blocks when the model supports it, documents become extracted text, and audio can be transcribed.

**User:** Ask about a file, screenshot, lecture recording, or note without manual copy-paste.

### Note Thread Attachments

**Built:** Note attachments can include linked notes as a thread.

**User:** Ask about one note plus its connected context.

### Focused AI Actions

**Built:** The composer can arm Analyze, Ask Notes, or Quiz over a scope managed in the right rail.

**User:** Ground the next AI action in your notes instead of chatting in the abstract.

### Thread/Day/Topic Analyzer

**Built:** `analyze` resolves context by topic retrieval, time window, or note plus linked thread, then returns summary, key concepts, open questions, weak spots, and source notes.

**User:** Summarize what you learned today, this week, around a topic, or around one note.

### Grounded Ask Notes

**Built:** `askNotes` answers using only resolved context notes and includes source chips.

**User:** Ask questions of your own notes and see which notes supported the answer.

### Graded Quizzes

**Built:** `generateQuiz`, `quizGrade`, and `QuizRunner` support MCQ, multi-answer, descriptive answers, settings, negative marking, anti-repeat memory, local objective grading, AI descriptive grading, persistence, and save-as-quiz-note.

**User:** Turn your notes into quizzes and retake saved practice sets later.

### Tag Suggestions

**Built:** `suggestTags` proposes tags through provider calls and `ComposerSuggestions` applies selected suggestions.

**User:** Let Jnana suggest useful tags while keeping you in control.

### Link Suggestions

**Built:** `suggestLinks` uses note context and semantic similarity to recommend wikilinks with evidence.

**User:** Discover related notes you might not have connected.

### Deep Research Toggle

**Built:** Chat can route to a configured deep-research endpoint or fall back to a deep-research prompt.

**User:** Ask for more thorough, source-grounded answers when a normal reply is too shallow.

### Thinking Toggle

**Built:** Model capability detection enables reasoning-mode options only for supported models.

**User:** Turn on deeper reasoning when the selected model supports it.

### Styles and Skills

**Built:** AI presets store reusable response styles and skill instructions in SQLite and inject them into chat.

**User:** Reuse preferred tones and task instructions instead of rewriting prompts.

### Projects

**Built:** AI projects store custom instructions, color, knowledge attachments, and project-linked conversations.

**User:** Keep AI work grouped by class, research project, or writing goal.

### Adaptive Rules

**Built:** Rules are stored per vault, selected per session and project, resolved into effective rules, and re-injected using configurable refresh strategies.

**User:** Keep long AI conversations aligned with your rules and writing/study standards.

### Agent Mode

**Built:** `runAgent` uses native tools to search, read, list recent notes, inspect graph neighbors, and stage create/append/tag/link proposals; writes require user approval.

**User:** Let AI help organize your vault while approving every change before it touches your notes.

**Workflow example:** Ask the agent to "find my thermodynamics notes, propose missing links, and draft a summary note." Review proposed notes and links, apply the useful ones, and skip the rest.

## 18. Built-In Learning Plugins

### Flashcard Decks

**Built:** The bundled flashcards plugin registers a custom note type with its own editor/view and SM-2 spaced repetition storage.

**User:** Create flashcard decks inside the same note system, not in a separate app.

### Pomodoro

**Built:** The bundled pomodoro plugin contributes a floating widget and command-palette commands.

**User:** Run focused study sessions without leaving your workspace.

### Quiz Notes

**Built:** The quiz plugin registers `kind='quiz'` notes so AI-generated quizzes can be saved, viewed, edited, and retaken.

**User:** Save a finished AI quiz as durable study material.

### Canvas Note Type

**Built:** The canvas plugin registers canvas as a custom note type, in addition to workspace canvases.

**User:** Store visual boards as first-class knowledge objects.

## 19. Plugin System

### Plugin Registry

**Built:** `pluginRegistry` registers plugins with context, storage, note types, UI widgets, commands, and teardown behavior.

**User:** Jnana can grow beyond built-in features.

### Custom Note Types

**Built:** Note types are ordinary notes with `notes.kind`; rendering and editing swap through `NoteRenderer` while search/export hooks are contributed by the note type.

**User:** Specialized tools such as flashcards still live in search, graph, export, and folders.

### Plugin Widgets

**Built:** Widgets render in `PluginWidgetHost`, a floating app-level tray.

**User:** Add small utility panels without changing the core app.

### Plugin Commands

**Built:** Plugin commands flow into the command palette via `pluginContributions`.

**User:** Installed tools become keyboard-accessible.

### Plugin Storage

**Built:** Plugins get scoped JSON key-value storage in the `plugin_kv` table.

**User:** Plugins can remember their own data without mixing it with core notes.

### Plugin Loader

**Built:** Installed plugin ESM is read, React imports are rewritten to host shims, and loaded from Blob URLs after install-time permission consent.

**User:** Add bundled, local, zipped, or catalog plugins when you want to extend Jnana.

### Plugin Manager

**Built:** Settings includes Installed, Browse, Updates, and Developer tools for enabling, disabling, installing, removing, packaging, scaffolding, and inspecting plugin logs.

**User:** Manage extensions from inside the app.

## 20. Home and Dashboard

### Returning-User Dashboard

**Built:** Home uses a dashboard section registry for quick actions, daily summary, continue learning, favourites, insights, graph snapshot, projects, recent imports, background tasks, and activity heatmap.

**User:** Start each session with the notes, actions, and progress that matter now.

### Customizable Dashboard Layout

**Built:** Dashboard preferences persist and the grid is hand-rolled with pointer events for React 19 compatibility.

**User:** Arrange the home view around your own habits.

### Background Task Visibility

**Built:** Dashboard and sidebar surfaces expose long-running jobs such as transcription.

**User:** See what Jnana is working on without interrupting your writing.

## 21. Appearance and Theme Studio

### Token-Level Theming

**Built:** Theme Studio edits CSS custom properties, applies them to `document.documentElement`, and persists active/saved themes in SQLite with a localStorage boot mirror.

**User:** Customize the whole app live without waiting for a restart.

### Built-In Presets

**Built:** Presets include Midnight, Paper, OLED, High Contrast, and Reading.

**User:** Pick a calm writing environment, a high-contrast workspace, or a reading-focused theme.

### Custom Theme Library

**Built:** Users can save, load, delete, export, and import theme JSON.

**User:** Carry your preferred Jnana look between installs or share it.

### Contrast Guardrail

**Built:** Theme Studio checks critical text/surface contrast pairs against AA/AAA/AA Large/Fail thresholds.

**User:** Customize colors without accidentally making notes unreadable.

### Fonts

**Built:** Font installation and listing are exposed through Rust commands and boot-loaded `@font-face` rules.

**User:** Use preferred reading or writing fonts across the app.

## 22. Settings and App Preferences

### General Settings

**Built:** General settings include startup view, confirm-before-delete, date format, week start, and trash retention.

**User:** Tune everyday behavior to your habits.

### Composer Settings

**Built:** Composer settings include options such as table edit mode.

**User:** Choose whether tables appear as rich grids or raw markdown fences while editing.

### AI Provider Settings

**Built:** AI settings manage providers, models, index stats, stale notes, and reindexing.

**User:** Configure exactly how AI works and when your notes are indexed.

### Advanced AI Generation

**Built:** Advanced settings configure rule refresh and selection strategies, including cheap defaults and experimental AI-based strategies.

**User:** Control how strongly Jnana keeps AI conversations aligned with your instructions.

### Import / Export Settings

**Built:** Data settings surface markdown export, full vault export, assets export, backup, restore, storage stats, data history, markdown folder import, and logs.

**User:** Move your knowledge in or out whenever you need.

### About and Licensing

**Built:** About displays source and AGPL/plugin-exception licensing information.

**User:** Jnana is transparent about its source, license, and plugin permissions.

## 23. Import, Export, Backup, and Portability

### Single and Bulk Markdown Export

**Built:** `core/export.ts` and Rust export commands write notes to Markdown with YAML frontmatter and copied relative assets.

**User:** Take notes to Obsidian, VS Code, GitHub, or plain folders.

### Full Vault Export

**Built:** Full vault export packages database and assets into a restorable zip.

**User:** Back up the whole knowledge base, including metadata that Markdown cannot carry.

### Backup and Restore

**Built:** `create_backup` and `restore_backup` round-trip DB and assets, with restore treated as destructive and confirmed in UI.

**User:** Make a restorable snapshot before big changes.

### Markdown Folder Import

**Built:** `import_markdown_dir` ingests folders of markdown into Jnana.

**User:** Bring an existing notes folder into the app.

### Asset Export

**Built:** Asset export copies stored media out through Rust commands.

**User:** Your files are not trapped inside the app.

### Logs and Storage Stats

**Built:** Settings can show storage statistics, data history, and open the logs directory.

**User:** Understand where space is going and find diagnostic files when needed.

## 24. UX Infrastructure

### Toasts

**Built:** The toast store supports normal notifications and progress toasts with updates.

**User:** Long actions show progress and finish with clear feedback.

### In-App Dialogs

**Built:** `DialogHost` provides choice, prompt, and confirm dialogs instead of native blocking browser dialogs.

**User:** Confirm destructive actions in a consistent Jnana-styled interface.

### Global Tooltip

**Built:** A single delegated tooltip upgrades `title` attributes across the app while preserving accessibility.

**User:** Hover controls for clear explanations without visual clutter.

### Error Boundary

**Built:** The router is wrapped in an error boundary that logs render errors and shows a recoverable fallback.

**User:** A UI bug is less likely to blank the whole app.

### View State Persistence

**Built:** `useViewState` stores route-local UI state in module stores that survive unmount/remount during navigation.

**User:** Search queries, chat drafts, graph settings, and AI state stay where you left them.

## 25. Performance and Scalability Work

### Lazy Routes

**Built:** Heavy routes such as CodeMirror, pdf.js, force graph, AI, Settings, Workspaces, Search, and Trash load on first visit.

**User:** Jnana starts faster because it does not parse every feature up front.

### Incremental Notes Rendering

**Built:** The notes gallery renders in pages with an IntersectionObserver sentinel.

**User:** Large note lists stay responsive.

### Lazy Embeds

**Built:** PDF thumbnails and web embeds defer expensive loading until visible.

**User:** Notes containing many files do not punish the whole list.

### Stable Widgets

**Built:** CodeMirror React widgets update in place when possible, with stable callbacks and keys for media/table widgets.

**User:** Editing near media or tables does not reset playback, focus, or scroll.

## 26. Workflow Packs for Promotion

### Student Lecture Workflow

1. Create a course workspace and collections for each unit.
2. Import lecture PDFs and slides into notes.
3. Record or import lecture audio.
4. Add timestamped notes beside the audio/video.
5. Transcribe the recording in the background.
6. Ask Focused AI to summarize today's notes and generate a quiz.
7. Save the quiz as a note and pin it before the exam.

**Promotion line:** Turn lectures into searchable notes, connected concepts, and practice quizzes without leaving your private study desk.

### Research Paper Workflow

1. Import a PDF paper.
2. Highlight claims, add ink marks, and place text notes directly on the PDF.
3. Create a table comparing method, evidence, limitation, and follow-up.
4. Link the paper note to related concepts with `[[wikilinks]]`.
5. Use workspace graph to find missing connections.
6. Ask AI to analyze the note plus its linked thread.

**Promotion line:** Read, annotate, connect, and synthesize papers in one local research workspace.

### Exam Prep Workflow

1. Filter a workspace to recent or tagged notes.
2. Use Insights to find untagged, orphaned, or stale-index notes.
3. Use AI link suggestions to connect concepts.
4. Generate graded quizzes by topic or time window.
5. Save quiz attempts as notes and retake them.
6. Use flashcard decks for spaced repetition.

**Promotion line:** Jnana turns scattered course material into a guided study system.

### Writing Workflow

1. Open source notes in split Working Notes panes.
2. Keep an outline note beside research notes.
3. Use backlinks and graph focus to navigate context.
4. Ask grounded AI for weak spots or open questions.
5. Export final notes to Markdown with assets.

**Promotion line:** Draft from your own connected knowledge instead of juggling tabs and disconnected documents.

### Visual Thinking Workflow

1. Open a workspace canvas.
2. Drop note cards, text cards, media, and web pages.
3. Draw clusters, connect nodes, and promote key connections to wikilinks.
4. Switch to the workspace graph to inspect the durable knowledge structure.

**Promotion line:** Brainstorm visually, then turn the useful structure into a real knowledge graph.

### Private AI Workflow

1. Configure Ollama for chat and embeddings, or mix local embeddings with a cloud chat provider.
2. Index notes into the local SQLite vector store.
3. Ask questions scoped to a vault or workspace.
4. Attach notes and include linked threads when needed.
5. Approve or reject agent proposals before any note changes.

**Promotion line:** Use AI over your own notes with local-first control and explicit approval for changes.

## 27. Honest Boundaries and Backlog Notes

These are useful for product copy so claims stay trustworthy:

- AI is optional and requires a configured provider or local model.
- Scanned/image-only PDFs do not become searchable text unless OCR is added later.
- Markdown export covers note text and assets, but not every app-specific metadata layer; full vault backup is the complete portable copy.
- Plugin hardening such as signature verification, granular permission grants, and optional sandboxing is still a future hardening area.
- Player-assisted timestamp writing and HEVC/H.265 transcoding are listed as deferred in progress docs.
- Some Theme Studio density/motion/reading-scale controls exist ahead of full CSS consumption.

## 28. Short Product Copy Bank

### One-Sentence Pitch

Jnana is a private desktop second brain where notes, PDFs, media, graphs, workspaces, and grounded AI study tools live together on your machine.

### Three-Bullet Pitch

- Capture notes, PDFs, audio, video, web pages, tables, and canvases in one local knowledge base.
- Connect ideas with wikilinks, workspaces, collections, and an explorable graph.
- Study and synthesize with optional AI grounded in your own notes, from quizzes to source-cited analysis.

### Tagline Options

- Your notes, connected.
- A private second brain for serious learning.
- Study from your own knowledge, not someone else's cloud.
- Notes, media, graph, and AI in one local workspace.
- Turn scattered material into connected understanding.

### Demo Flow for a Short Product Video

1. Capture a note and embed a PDF.
2. Highlight the PDF and add a text note on the page.
3. Link the note to another note with `[[wikilinks]]`.
4. Open the graph and show the new connection.
5. Open a workspace canvas and arrange related notes visually.
6. Ask Focused AI to quiz the workspace.
7. Save the quiz as a note.
8. Export notes or create a backup to close on ownership and portability.

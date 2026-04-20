# Jnana

Jnana is a local-first desktop knowledge app built with Tauri, React, TypeScript, Rust, and SQLite.

It is aimed at students and note-heavy workflows, with support for:
- plain text notes
- wikilinks and graph navigation
- local video embeds with timestamp links
- YouTube embeds
- PDF viewing with highlight annotations
- image attachments
- document import and conversion

This repository is the fork maintained at:

https://github.com/rgbRavi/Jnana---A-Second-brain

## Current Status

Working today:
- note CRUD with SQLite persistence
- graph view driven by wikilinks
- local video import and playback
- YouTube embeds
- PDF import, viewing, and saved highlight annotations
- document import through PDF conversion, text extraction, or external-open flow
- plugin framework scaffolding

Not finished yet:
- audio player
- theme switcher
- full-text search
- markdown mirror/export
- AI/plugin features

## Tech Stack

- Tauri v2
- React 19
- TypeScript
- Rust
- SQLite via `rusqlite`
- Vite 7
- Plyr
- pdfjs-dist
- LibreOffice + Pandoc for document workflows
- react-force-graph-2d

## Getting Started

### Prerequisites

- Node.js 18+
- Rust + Cargo
- Microsoft C++ Build Tools on Windows

Optional but recommended for document workflows:
- LibreOffice
- Pandoc

### Clone

```bash
git clone https://github.com/rgbRavi/Jnana---A-Second-brain.git
cd Jnana---A-Second-brain
```

### Install

```bash
npm install
```

### Run in development

```bash
npm run tauri dev
```

### Other useful commands

```bash
npm run build
npm test
```

## Project Structure

```text
src/
  core/      Tauri-facing app services
  hooks/     UI orchestration and stateful flows
  lib/       event bus and plugin infrastructure
  types/     shared frontend types
  ui/        React components

src-tauri/
  src/commands/  Tauri commands
  src/db/        SQLite init, schema, queries
```

## Architecture Notes

- `ui/` does not import `core/` directly
- hooks are the boundary between UI and app services
- notes, links, and annotations stay in sync through an event bus
- local assets are served through a custom `jnana-asset://` protocol
- media registration is deferred for unsaved notes, then flushed after save

## Documents and Media

Document handling currently supports three paths:
- import PDF directly
- convert `doc` / `docx` / `odt` to PDF
- extract plain text into the note

External document links are copied into app-managed storage so they still work if the original file moves.

## Notes

- The current `README.md` reflects the repo as it exists now
- More detailed implementation status lives in `PROGRESS.md`

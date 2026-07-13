// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { eventBus } from "./lib/eventBus";
import { openNoteInWorking, useNotesSubView, getNotesSubView, setNotesSubView } from "./views/notes/working/useWorkingLayout";
import type { Note } from "./types";
import { toast } from "./lib/toast";
import { Sidebar } from "./ui/Sidebar";
import { FileExplorer } from "./ui/folders/FileExplorer";
import { Toaster } from "./ui/Toaster";
import { DialogHost } from "./ui/DialogHost";
import { CommandPalette } from "./ui/CommandPalette";
import { Tooltip } from "./ui/Tooltip";
import { NoteCreator } from "./ui/editor/NoteCreator";
import { ThemeStudioOverlay } from "./ui/settings/appearance/ThemeStudioOverlay";
import { NotesProvider, useNotesContext } from "./context/NotesContext";
import { TranscriptionProvider } from "./context/TranscriptionContext";
import { useActiveVaultId } from "./hooks/useVaults";
import { setVaultScope } from "./core/ai";
import { DEFAULT_VAULT_ID } from "./types";
import { useSaveLastOpened } from "./hooks/useSaveLastOpened";
import { useTheme } from "./hooks/useTheme";
import { useViewState, setViewState } from "./hooks/useViewState";
import AppStyles from "./App.module.css"

// HashRouter always boots at "/", so the app forgets which view you were on.
// Persist the last route and restore it on launch (the Notes sub-view —
// gallery vs Working Notes — already persists separately, so restoring /notes
// lands you back in Working Notes). Captured at module load, *before* any effect
// can overwrite it with the initial "/".
const LAST_ROUTE_KEY = "jnana.lastRoute.v1"
const initialRoute = (() => {
    try {
        return localStorage.getItem(LAST_ROUTE_KEY)
    } catch {
        return null
    }
})()

function AppInner() {
    useSaveLastOpened()
    // Reconciles the localStorage boot mirror against the SQLite-stored active
    // theme (source of truth) and seeds built-in presets on first run — runs
    // once regardless of whether the user ever opens Settings → Appearance.
    useTheme()
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const { create, update, notes } = useNotesContext()
    const activeVaultId = useActiveVaultId()
    // Keep RAG retrieval constrained to the active vault app-wide (orthogonal to
    // the workspace scope the AI view may set) — so AI never surfaces notes from
    // another vault. Recomputed as notes are created / moved between vaults.
    useEffect(() => {
        setVaultScope(new Set(notes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId).map((n) => n.id)))
    }, [notes, activeVaultId])
    // Restore the last route once on launch (before the save effect below can
    // overwrite the stored value with the initial "/").
    const restoredRef = useRef(false)
    useEffect(() => {
        if (restoredRef.current) return
        restoredRef.current = true
        if (initialRoute && initialRoute !== pathname) {
            navigate(initialRoute, { replace: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // Remember the current route for next launch.
    useEffect(() => {
        try {
            localStorage.setItem(LAST_ROUTE_KEY, pathname)
        } catch {
            /* storage unavailable */
        }
    }, [pathname])
    // Ctrl/⌘+Shift+E — jump to the Working Notes desk from anywhere; when already
    // on /notes it toggles back to the gallery. Non-intrusive (no existing binding)
    // and intuitive ("E" for the editor desk).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
                e.preventDefault()
                if (pathname !== '/notes') {
                    setNotesSubView('working')
                    navigate('/notes')
                } else {
                    setNotesSubView(getNotesSubView() === 'working' ? 'gallery' : 'working')
                }
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [navigate, pathname])
    // Opening a note (a clicked wikilink, or the peek modal's "Edit in Working
    // Notes") routes to the Notes desk and opens it as a tab. Global so it works
    // from any view (Canvas, Search, an editor's wikilink, …).
    useEffect(() => {
        const handler = (note: Note) => {
            // Remember where the jump came from (a workspace, search, home, …) so
            // Working Notes can offer a "← Back" that returns there. Only capture
            // real origins — opening another note while already on /notes must not
            // overwrite the original origin with '/notes'.
            if (pathname !== "/notes") setViewState<string | null>('notes.returnTo', pathname)
            // Pass the note's vault so opening from anywhere (search, a wikilink,
            // a cross-vault peek) switches to that vault's desk.
            openNoteInWorking(note.id, note.vaultId ?? undefined)
            if (pathname !== "/notes") navigate("/notes")
        }
        eventBus.on('note:navigate', handler)
        return () => eventBus.off('note:navigate', handler)
    }, [navigate, pathname])
    // Materialize a pseudo-note when a missing `[[wikilink]]` is clicked (read/
    // edit mode). The graph handles its own pseudo-node clicks locally.
    useEffect(() => {
        const handler = async ({ title }: { title: string }) => {
            try {
                const created = await create(title, '')
                toast.success(`Created “${created.title}”`)
                eventBus.emit('note:navigate', created)
            } catch {
                toast.error('Could not create the note.')
            }
        }
        eventBus.on('wikilink:create', handler)
        return () => eventBus.off('wikilink:create', handler)
    }, [create])
    // The active workspace tab (shared store written by Workspace.tsx) — the
    // composer is suppressed on the freeform Canvas, which owns its own surface.
    const [wsTab] = useViewState<string>('workspace.tab', 'dashboard')
    // The floating composer lives on the capture surfaces (Home, Notes gallery,
    // and a workspace page — where new notes auto-add to the active workspace).
    const notesSubView = useNotesSubView()
    const onCanvasTab = pathname.startsWith("/workspaces/") && wsTab === 'canvas'
    // Suppress it on the Working Notes desk (its tab-strip ＋ creates notes, and a
    // floating composer would overlap the editor) and on the Canvas.
    const onWorkingDesk = pathname === "/notes" && notesSubView === 'working'
    const showComposer =
        (pathname === "/" || pathname === "/notes" || pathname.startsWith("/workspaces/")) &&
        !onCanvasTab &&
        !onWorkingDesk
    return (
        <div className={AppStyles.appShell}>
            <Sidebar />
            <FileExplorer />
            <main className={AppStyles.mainContent}>
                <Outlet />
                {showComposer && <NoteCreator onCreate={create} onUpdate={update} />}
            </main>
            <CommandPalette />
            <Tooltip />
            <Toaster />
            <DialogHost />
            <ThemeStudioOverlay />
        </div>
    )
}

export default function AppLayout(){
    return (
        <NotesProvider>
            <TranscriptionProvider>
                <AppInner />
            </TranscriptionProvider>
        </NotesProvider>
    )
}
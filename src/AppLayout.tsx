import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";
import { DialogHost } from "./ui/DialogHost";
import { CommandPalette } from "./ui/CommandPalette";
import { NoteCreator } from "./ui/editor/NoteCreator";
import { ThemeStudioOverlay } from "./ui/settings/appearance/ThemeStudioOverlay";
import { NotesProvider, useNotesContext } from "./context/NotesContext";
import { TranscriptionProvider } from "./context/TranscriptionContext";
import { useSaveLastOpened } from "./hooks/useSaveLastOpened";
import { useTheme } from "./hooks/useTheme";
import { useViewState } from "./hooks/useViewState";
import AppStyles from "./App.module.css"

function AppInner() {
    useSaveLastOpened()
    // Reconciles the localStorage boot mirror against the SQLite-stored active
    // theme (source of truth) and seeds built-in presets on first run — runs
    // once regardless of whether the user ever opens Settings → Appearance.
    useTheme()
    const { pathname } = useLocation()
    const { create, update } = useNotesContext()
    // The active workspace tab (shared store written by Workspace.tsx) — the
    // composer is suppressed on the freeform Canvas, which owns its own surface.
    const [wsTab] = useViewState<string>('workspace.tab', 'dashboard')
    // The floating composer lives on the capture surfaces (Home, Notes, and a
    // workspace page — where new notes auto-add to the active workspace).
    const onCanvasTab = pathname.startsWith("/workspaces/") && wsTab === 'canvas'
    const showComposer = (pathname === "/" || pathname === "/notes" || pathname.startsWith("/workspaces/")) && !onCanvasTab
    return (
        <div className={AppStyles.appShell}>
            <Sidebar />
            <main className={AppStyles.mainContent}>
                <Outlet />
            </main>
            {showComposer && <NoteCreator onCreate={create} onUpdate={update} />}
            <CommandPalette />
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
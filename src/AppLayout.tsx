import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";
import { DialogHost } from "./ui/DialogHost";
import { CommandPalette } from "./ui/CommandPalette";
import { NoteCreator } from "./ui/editor/NoteCreator";
import { NotesProvider, useNotesContext } from "./context/NotesContext";
import { TranscriptionProvider } from "./context/TranscriptionContext";
import { useSaveLastOpened } from "./hooks/useSaveLastOpened";
import AppStyles from "./App.module.css"

function AppInner() {
    useSaveLastOpened()
    const { pathname } = useLocation()
    const { create, update } = useNotesContext()
    // The floating composer lives on the capture surfaces (Home, Notes, and a
    // workspace page — where new notes auto-add to the active workspace).
    const showComposer = pathname === "/" || pathname === "/notes" || pathname.startsWith("/workspaces/")
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
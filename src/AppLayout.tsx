import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";
import { DialogHost } from "./ui/DialogHost";
import { NoteCreator } from "./ui/editor/NoteCreator";
import { NotesProvider, useNotesContext } from "./context/NotesContext";
import { TranscriptionProvider } from "./context/TranscriptionContext";
import { useSaveLastOpened } from "./hooks/useSaveLastOpened";
import AppStyles from "./App.module.css"

function AppInner() {
    useSaveLastOpened()
    const { pathname } = useLocation()
    const { create, update } = useNotesContext()
    // The floating composer lives on the capture surfaces only (Home + Notes).
    const showComposer = pathname === "/" || pathname === "/notes"
    return (
        <div className={AppStyles.appShell}>
            <Sidebar />
            <main className={AppStyles.mainContent}>
                <Outlet />
            </main>
            {showComposer && <NoteCreator onCreate={create} onUpdate={update} />}
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
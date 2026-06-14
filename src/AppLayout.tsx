import { Outlet } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { Toaster } from "./ui/Toaster";
import { NotesProvider } from "./context/NotesContext";
import { TranscriptionProvider } from "./context/TranscriptionContext";
import { useSaveLastOpened } from "./hooks/useSaveLastOpened";
import AppStyles from "./App.module.css"

function AppInner() {
    useSaveLastOpened()
    return (
        <div className={AppStyles.appShell}>
            <Sidebar />
            <main className={AppStyles.mainContent}>
                <Outlet />
            </main>
            <Toaster />
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
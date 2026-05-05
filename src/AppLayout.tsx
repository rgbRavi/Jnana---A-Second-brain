import { Outlet } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { NotesProvider } from "./context/NotesContext";
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
        </div>
    )
}

export default function AppLayout(){
    return (
        <NotesProvider>
            <AppInner />
        </NotesProvider>
    )
}
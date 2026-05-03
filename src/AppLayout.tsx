import { Outlet } from "react-router-dom";
import { Sidebar } from "./ui/Sidebar";
import { NotesProvider } from "./context/NotesContext";
import AppStyles from "./App.module.css"

export default function AppLayout(){
    return (
        <NotesProvider>
            <div className={AppStyles.appShell}>
                <Sidebar />
                <main className={AppStyles.mainContent}>
                    <Outlet />
                </main>
            </div>
        </NotesProvider>
    )
}
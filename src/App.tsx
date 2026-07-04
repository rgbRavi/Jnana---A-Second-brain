import {HashRouter, Routes, Route} from "react-router-dom";
import AppLayout from "./AppLayout";
import NotesView from './views/notes/NotesView'
import Graph from "./views/graph/Graph";
import Search from "./views/search/Search";
import Home from "./views/home/Home"
import Ai from "./views/ai/Ai";
import Settings from "./views/settings/Settings";
import Workspaces from "./views/workspaces/Workspaces";
import Workspace from "./views/workspaces/Workspace";

function App() {
    return (
        <>
            <div className="router-section">
                <HashRouter basename="jnana">
                    <Routes>
                        <Route element= {<AppLayout />}>
                                <Route path = "/" element = {<Home />} />
                                <Route path = "/notes" element = {<NotesView />} />
                                <Route path = "/graph" element = {<Graph />}/>
                                <Route path = "/search" element = {<Search />}/>
                                <Route path = "/ai" element = {<Ai />}/>
                                <Route path = "/workspaces" element = {<Workspaces />}/>
                                <Route path = "/workspaces/:id" element = {<Workspace />}/>
                                <Route path = "/settings" element = {<Settings />}/>
                        </Route>
                    </Routes>
                </HashRouter>
            </div>
        </>
    )
}

export default App
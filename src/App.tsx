import {HashRouter, Routes, Route} from "react-router-dom";
import AppLayout from "./AppLayout";
import Notes from './views/notes/Notes'
import Graph from "./views/graph/Graph";
import Search from "./views/search/Search";
import Home from "./views/home/Home"
import Ai from "./views/ai/Ai";
import Settings from "./views/settings/Settings";

function App() {
    return (
        <>
            <div className="router-section">
                <HashRouter basename="jnana">
                    <Routes>
                        <Route element= {<AppLayout />}>
                                <Route path = "/" element = {<Home />} />
                                <Route path = "/notes" element = {<Notes />} />
                                <Route path = "/graph" element = {<Graph />}/>
                                <Route path = "/search" element = {<Search />}/>
                                <Route path = "/ai" element = {<Ai />}/>
                                <Route path = "/settings" element = {<Settings />}/>
                        </Route>
                    </Routes>
                </HashRouter>
            </div>
        </>
    )
}

export default App
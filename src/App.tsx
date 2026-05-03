import {HashRouter, Routes, Route} from "react-router-dom";
import AppLayout from "./AppLayout";
import Home from './views/home/Home'
import Graph from "./views/graph/Graph";
import Search from "./views/search/Search";
import AppStyle from "./App.module.css"

function App() {
    return (
        <>
            <div className="router-section">
                <HashRouter basename="jnana">
                    <Routes>
                        <Route element= {<AppLayout />}>
                                <Route path = "/" element = {<Home />} />
                                <Route path = "/graph" element = {<Graph />}/>
                                <Route path = "/search" element = {<Search />}/>
                        </Route>
                    </Routes>
                </HashRouter>
            </div>
        </>
    )
}

export default App
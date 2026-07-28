// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import {HashRouter, Routes, Route} from "react-router-dom";
import { lazy } from "react";
import AppLayout from "./AppLayout";
import ErrorBoundary from "./ui/ErrorBoundary";
import Home from "./views/home/Home"
// Heavy views (CodeMirror, pdf.js, force-graph live in these) load on first visit,
// so cold start doesn't parse every route up front. Home stays eager — it's the
// default boot view, and lazy-loading it would flash on the most common landing.
const NotesView = lazy(() => import('./views/notes/NotesView'))
const Graph = lazy(() => import("./views/graph/Graph"))
const Search = lazy(() => import("./views/search/Search"))
const Ai = lazy(() => import("./views/ai/Ai"))
const Settings = lazy(() => import("./views/settings/Settings"))
const AiSettings = lazy(() => import("./ui/ai/AiSettingsPanel"))
const TrashView = lazy(() => import("./views/trash/TrashView"))
const Workspaces = lazy(() => import("./views/workspaces/Workspaces"))
const Workspace = lazy(() => import("./views/workspaces/Workspace"))

function App() {
    return (
        <>
            <div className="router-section">
                <ErrorBoundary>
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
                                    <Route path = "/settings/ai" element = {<AiSettings />}/>
                                    <Route path = "/trash" element = {<TrashView />}/>
                            </Route>
                        </Routes>
                    </HashRouter>
                </ErrorBoundary>
            </div>
        </>
    )
}

export default App
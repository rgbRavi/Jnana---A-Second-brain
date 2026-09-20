// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import HomeStyle from "./Home.module.css"
import {useState} from "react"
import HomeNewVisitorContent from "./HomeNewVisitorContent"
import HomeReturningVisitorContent from "./HomeReturningVisitorContent"
import { useScrollMemory } from "../../hooks/useScrollMemory"


function Home(){

    // Read on first render, not in an effect: the first paint then has the real
    // content (no flash), and useScrollMemory can restore against it right away.
    const [hasVisited] = useState<boolean>(() => {
        try {
            const visited = localStorage.getItem("hasvisited") !== null
            localStorage.setItem("hasvisited", "true")
            return visited
        } catch {
            return true // private mode / blocked storage — treat as a return visit
        }
    })

    const { ref, onScroll } = useScrollMemory<HTMLDivElement>('home')

    return(
        <div className={HomeStyle.homeContainer} ref={ref} onScroll={onScroll}>
            {hasVisited ? <HomeReturningVisitorContent /> : <HomeNewVisitorContent />}
        </div>
    )
}

export default Home

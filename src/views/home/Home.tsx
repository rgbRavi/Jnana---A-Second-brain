import HomeStyle from "./Home.module.css"
import {useState, useEffect} from "react"
import HomeNewVisitorContent from "./HomeNewVisitorContent"
import HomeReturningVisitorContent from "./HomeReturningVisitorContent"


function Home(){

    const [hasVisited, setHasVisited] = useState<Boolean | null>(null)


    useEffect(() => {
        const visited = localStorage.getItem("hasvisited")
        if (visited) {
            setHasVisited(true)
        } else {
            setHasVisited(false)
            localStorage.setItem("hasvisited", "true")
        }
    }, [])

    return(
        <div className={HomeStyle.homeContainer}>
            {/* {hasVisited ? <HomeReturningVisitorContent /> : <HomeNewVisitorContent />} */}
            <HomeReturningVisitorContent/>
        </div>
    )
}

export default Home
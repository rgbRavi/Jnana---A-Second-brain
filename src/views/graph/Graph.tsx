import { GraphView } from "../../ui/graph/GraphView"
import { useNotes } from "../../hooks/useNotes"

function Graph(){

    const {update, remove } = useNotes()
    return(
        <div className="graph-view">
            <GraphView onUpdate={update} onRemove={remove} />
        </div>
    )
}


export default Graph
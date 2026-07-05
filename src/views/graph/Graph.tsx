import { GraphView } from "../../ui/graph/GraphView"
import { useNotesContext } from "../../context/NotesContext"

function Graph(){

    // Use the single app-wide notes instance from AppLayout, not a fresh one.
    const { create, update, remove } = useNotesContext()
    return(
        <div className="graph-view">
            <GraphView onCreate={create} onUpdate={update} onRemove={remove} />
        </div>
    )
}


export default Graph
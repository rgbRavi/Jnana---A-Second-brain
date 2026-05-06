import { NoteCreator } from "../../ui/editor/NoteCreator"
import { useNotesContext } from '../../context/NotesContext'
import ContentStyles from "./HomeNewVisitorContent.module.css"

function HomeNewVisitorContent() {

    const {create, update} = useNotesContext()
    return(
        <div className={ContentStyles.contentContainer}>
            <h1> Hello and Welcome To Jnana !</h1>
            <p className={ContentStyles.quote}> “I cannot teach anybody anything. I can only make them think” ― Socrates </p>
            <div className={ContentStyles.homeBrief}>
                <h2>What is Jnana?</h2>
                <p> Jnana is your personal knowledge management system and assistant.</p> 
                <p>  You can use it to store all kind of notes from plain text to media like:</p>
                <ul>
                    <li>images</li>
                    <li>videos</li>
                    <li>documents(pdf natively, docx externally)</li>
                    <li>audios</li>
                    <li>YouTube Videos</li>
                </ul>
                <p> You can also link your notes together to create a web of knowledge and easily find connections between different ideas. </p>
                <p> Jnana also has a powerful search engine that allows you to find any note or piece of information in your knowledge base in seconds. </p>
                <p> So what are you waiting for ? Start creating your second brain with Jnana !</p>
            </div>
            <div className={ContentStyles.gettingStarted}>
                <h2>Getting Started</h2>
                <p>Write Your First Note It's super easy !</p>
                
                <NoteCreator onCreate={create} onUpdate={update}/>
            </div>
        </div>
    )
}

export default HomeNewVisitorContent
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import ContentStyles from "./HomeNewVisitorContent.module.css"

function HomeNewVisitorContent() {
    return(
        <div className={ContentStyles.contentContainer}>
            <div className={ContentStyles.column}>
                <h1>Welcome to Jnana</h1>
                <p className={ContentStyles.quote}>“I cannot teach anybody anything. I can only make them think.” ― Socrates</p>

                <section className={ContentStyles.section}>
                    <h2>What is Jnana?</h2>
                    <p>Jnana is your personal knowledge base. It keeps plain-text notes and the media that belongs with them:</p>
                    <ul>
                        <li>images</li>
                        <li>videos and YouTube links</li>
                        <li>audio recordings</li>
                        <li>documents (PDF natively, DOCX via a converter)</li>
                    </ul>
                    <p>Link notes together to build a web of ideas, and find anything again in seconds from the command palette.</p>
                </section>

                <section className={ContentStyles.section}>
                    <h2>Getting started</h2>
                    <p>Write your first note with the “Click to take a note” box pinned at the bottom of the window.</p>
                </section>
            </div>
        </div>
    )
}

export default HomeNewVisitorContent

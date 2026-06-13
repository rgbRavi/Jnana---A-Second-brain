import { useState } from "react"
import { NavLink } from "react-router-dom"
import { useTranscription } from "../context/TranscriptionContext"
import SidebarStyles from "./Sidebar.module.css"

export function Sidebar(){
    const { jobs } = useTranscription()
    const [trayOpen, setTrayOpen] = useState(false)
    const runningCount = jobs.filter((j) => j.status === 'running').length

    return(
        <aside className={SidebarStyles.sidebar}>
          <div className={SidebarStyles.sidebarLogo}>
            <h1>Jnana</h1>
            <span>Second brain</span>
          </div>
          <nav className={SidebarStyles.sidebarNav}>
            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.sidebarNavItem}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/"
            >
              Home
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.sidebarNavItem}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/Notes"
            >
              Notes
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.sidebarNavItem}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/search"
            >
              Search
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.sidebarNavItem}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/graph"
            >
              Graph
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.sidebarNavItem}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/ai"
            >
              AI Analyzer
            </NavLink>
          </nav>

          <div className={SidebarStyles.sidebarBottom}>
          {jobs.length > 0 && (
            <div className={SidebarStyles.transcribeFooter}>
              {trayOpen && (
                <div className={SidebarStyles.transcribeTray}>
                  <div className={SidebarStyles.transcribeTrayHead}>Transcribing</div>
                  {jobs.map((j) => (
                    <div key={j.id} className={SidebarStyles.transcribeItem}>
                      <span className={SidebarStyles.transcribeStatus}>
                        {j.status === 'running' ? '⏳' : j.status === 'done' ? '✓' : '⚠'}
                      </span>
                      <div className={SidebarStyles.transcribeMeta}>
                        <span className={SidebarStyles.transcribeNote}>{j.noteTitle || 'Untitled'}</span>
                        <span className={SidebarStyles.transcribeFile}>{j.filename}</span>
                        {j.status === 'error' && (
                          <span className={SidebarStyles.transcribeErr}>{j.error}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                className={SidebarStyles.transcribeToggle}
                onClick={() => setTrayOpen((o) => !o)}
                title="Transcription jobs"
              >
                {runningCount > 0 && <span className={SidebarStyles.transcribeDot} />}
                <span>
                  Transcribing{runningCount > 0 ? ` (${runningCount})` : ''}
                </span>
                <span className={SidebarStyles.transcribeChevron}>{trayOpen ? '⌄' : '⌃'}</span>
              </button>
            </div>
          )}

            <NavLink
              className={({ isActive }) =>
                `${SidebarStyles.settingsLink}${isActive ? ' ' + SidebarStyles.active : ''}`
              }
              to="/settings"
            >
              ⚙ Settings
            </NavLink>
          </div>
        </aside>
    )
}
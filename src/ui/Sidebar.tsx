// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { useTranscription } from "../context/TranscriptionContext"
import { useSidebarPrefs, toggleSidebarCollapsed } from "../hooks/useSidebarPrefs"
import { useWorkspaces } from "../hooks/useWorkspaces"
import { useActiveWorkspace } from "../hooks/useActiveWorkspace"
import { openComposer } from "./editor/NoteCreator"
import SidebarStyles from "./Sidebar.module.css"

const nav = (path: ReactNode) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

const ICONS = {
  home: nav(<path d="M3 9.5 10 3.5l7 6V16a1.5 1.5 0 0 1-1.5 1.5H12.5V12h-5v5.5H4.5A1.5 1.5 0 0 1 3 16Z" />),
  quickNote: nav(
    <>
      <path d="M12.5 3.5 16.5 7.5 8 16H4v-4z" />
      <path d="M11 5 15 9" />
    </>,
  ),
  notes: nav(
    <>
      <rect x="4.5" y="3" width="11" height="14" rx="2" />
      <path d="M7.5 7h5M7.5 10h5M7.5 13h3" />
    </>,
  ),
  search: nav(
    <>
      <circle cx="9" cy="9" r="5" />
      <path d="M16.5 16.5 13 13" />
    </>,
  ),
  graph: nav(
    <>
      <circle cx="5" cy="6.5" r="1.8" />
      <circle cx="15" cy="5.5" r="1.8" />
      <circle cx="11" cy="15" r="1.8" />
      <path d="M6.7 7.4 9.4 13.6M13.5 6.6 11.7 13.4M6.7 6.2 13.3 5.7" />
    </>,
  ),
  ai: nav(
    <>
      <path d="M10 3.5 11.3 7.7 15.5 9 11.3 10.3 10 14.5 8.7 10.3 4.5 9 8.7 7.7Z" />
      <path d="M15.3 13.4 15.8 14.9 17.3 15.4 15.8 15.9 15.3 17.4 14.8 15.9 13.3 15.4 14.8 14.9Z" />
    </>,
  ),
  settings: nav(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8" />
    </>,
  ),
  workspaces: nav(<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2.6l1.4 1.8H15.5A1.5 1.5 0 0 1 17 8.3V14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14Z" />),
}

const itemClass =
  (isActive: boolean) => `${SidebarStyles.sidebarNavItem}${isActive ? " " + SidebarStyles.active : ""}`

export function Sidebar() {
  const { jobs } = useTranscription()
  const { collapsed } = useSidebarPrefs()
  const { workspaces } = useWorkspaces()
  const { pinnedWorkspaceIds } = useActiveWorkspace()
  const navigate = useNavigate()
  const [trayOpen, setTrayOpen] = useState(false)
  const runningCount = jobs.filter((j) => j.status === "running").length
  const pinnedWorkspaces = workspaces.filter((w) => pinnedWorkspaceIds.includes(w.id))

  // One-click capture: land on Notes and open the (app-level) composer expanded.
  const handleQuickNote = () => {
    navigate("/notes")
    openComposer()
  }

  return (
    <aside className={`${SidebarStyles.sidebar}${collapsed ? " " + SidebarStyles.collapsed : ""}`}>
      <div className={SidebarStyles.sidebarLogo}>
        <div className={SidebarStyles.logoRow}>
          <span className={SidebarStyles.logoBrand}>
            <span className={SidebarStyles.logoMark} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.5 2.5 0 0 0-1.5 2.3c0 .6.2 1.1.6 1.5A2.5 2.5 0 0 0 6 13c0 1 .6 1.9 1.5 2.3A2 2 0 0 0 9.5 18 2 2 0 0 0 12 16V6a2 2 0 0 0-2.5-1.5Z" />
                <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.5 2.5 0 0 1 1.5 2.3c0 .6-.2 1.1-.6 1.5A2.5 2.5 0 0 1 18 13c0 1-.6 1.9-1.5 2.3A2 2 0 0 1 14.5 18 2 2 0 0 1 12 16" />
              </svg>
            </span>
            <span className={SidebarStyles.wordmark}>
              <h1>Jnana</h1>
              <span className={SidebarStyles.tagline}>Second Brain</span>
            </span>
          </span>
          <button
            type="button"
            className={SidebarStyles.collapseToggle}
            onClick={toggleSidebarCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
      </div>

      <nav className={SidebarStyles.sidebarNav}>
        <NavLink to="/" end className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Home" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.home}</span>
          <span className={SidebarStyles.label}>Home</span>
        </NavLink>

        <button
          type="button"
          className={SidebarStyles.sidebarNavItem}
          onClick={handleQuickNote}
          title={collapsed ? "Quick Note" : undefined}
        >
          <span className={SidebarStyles.navIcon}>{ICONS.quickNote}</span>
          <span className={SidebarStyles.label}>Quick Note</span>
        </button>

        <NavLink to="/notes" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Notes" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.notes}</span>
          <span className={SidebarStyles.label}>Notes</span>
        </NavLink>

        <NavLink to="/workspaces" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Workspaces" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.workspaces}</span>
          <span className={SidebarStyles.label}>Workspaces</span>
        </NavLink>

        {/* Kept mounted (label hidden via CSS when collapsed, not unmounted) so
            toggling the sidebar doesn't also mount/unmount this list mid-animation. */}
        {pinnedWorkspaces.map((w) => (
          <NavLink
            key={w.id}
            to={`/workspaces/${w.id}`}
            className={({ isActive }) => `${itemClass(isActive)} ${SidebarStyles.subItem}`}
            title={collapsed ? w.name : undefined}
          >
            <span className={SidebarStyles.navIcon} aria-hidden="true">{w.icon || "📁"}</span>
            <span className={SidebarStyles.label}>{w.name}</span>
          </NavLink>
        ))}

        <NavLink to="/search" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Search" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.search}</span>
          <span className={SidebarStyles.label}>Search</span>
        </NavLink>
        <NavLink to="/graph" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Graph" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.graph}</span>
          <span className={SidebarStyles.label}>Graph</span>
        </NavLink>
        <NavLink to="/ai" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "AI" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.ai}</span>
          <span className={SidebarStyles.label}>AI</span>
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
                      {j.status === "running" ? "⏳" : j.status === "done" ? "✓" : "⚠"}
                    </span>
                    <div className={SidebarStyles.transcribeMeta}>
                      <span className={SidebarStyles.transcribeNote}>{j.noteTitle || "Untitled"}</span>
                      <span className={SidebarStyles.transcribeFile}>{j.filename}</span>
                      {j.status === "error" && <span className={SidebarStyles.transcribeErr}>{j.error}</span>}
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
              <span className={SidebarStyles.label}>Transcribing{runningCount > 0 ? ` (${runningCount})` : ""}</span>
              {!collapsed && <span className={SidebarStyles.transcribeChevron}>{trayOpen ? "⌄" : "⌃"}</span>}
            </button>
          </div>
        )}

        <NavLink to="/settings" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Settings" : undefined}>
          <span className={SidebarStyles.navIcon}>{ICONS.settings}</span>
          <span className={SidebarStyles.label}>Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}

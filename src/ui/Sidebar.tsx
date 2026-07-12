// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from "react"
import { NavLink, useNavigate, useLocation } from "react-router-dom"
import { useTranscription } from "../context/TranscriptionContext"
import { useSidebarPrefs, toggleSidebarCollapsed } from "../hooks/useSidebarPrefs"
import { useWorkspaces } from "../hooks/useWorkspaces"
import { useActiveWorkspace, closeWorkspace } from "../hooks/useActiveWorkspace"
import { openComposer } from "./editor/NoteCreator"
import { useWorkingLayout, useNotesSubView, setNotesSubView } from "../views/notes/working/useWorkingLayout"
import { allOpenNoteIds } from "../views/notes/working/layout"
import { Home, PenLine, Library, Search, Network, Sparkles, Settings, FolderTree, ChevronDown, Folder, PanelLeftClose, PanelLeftOpen, X, ChevronUp, Check, AlertTriangle, Hourglass } from "lucide-react"
import SidebarStyles from "./Sidebar.module.css"

const ICONS = {
  home: <Home size={18} strokeWidth={1.8} />,
  quickNote: <PenLine size={18} strokeWidth={1.8} />,
  notes: <Library size={18} strokeWidth={1.8} />,
  search: <Search size={18} strokeWidth={1.8} />,
  graph: <Network size={18} strokeWidth={1.8} />,
  ai: <Sparkles size={18} strokeWidth={1.8} />,
  settings: <Settings size={18} strokeWidth={1.8} />,
  workspaces: <FolderTree size={18} strokeWidth={1.8} />,
  chevron: <ChevronDown size={14} strokeWidth={2} />,
}

const itemClass =
  (isActive: boolean) => `${SidebarStyles.sidebarNavItem}${isActive ? " " + SidebarStyles.active : ""}`

export function Sidebar() {
  const { jobs } = useTranscription()
  const { collapsed } = useSidebarPrefs()
  // Pinned/open are cross-vault shortcuts — resolve them against ALL workspaces
  // (not just the active vault's) so they never vanish when you switch vaults;
  // clicking one switches the active vault to match (see onOpenWorkspace).
  const { allWorkspaces } = useWorkspaces()
  const { pinnedWorkspaceIds, openWorkspaceIds } = useActiveWorkspace()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const subView = useNotesSubView()
  const layout = useWorkingLayout()
  const openCount = allOpenNoteIds(layout).length
  const [trayOpen, setTrayOpen] = useState(false)
  const [wsExpanded, setWsExpanded] = useState(true)
  const [notesExpanded, setNotesExpanded] = useState(true)
  const runningCount = jobs.filter((j) => j.status === "running").length
  const pinnedWorkspaces = allWorkspaces.filter((w) => pinnedWorkspaceIds.includes(w.id))
  // "Open" excludes pinned ones so a workspace never appears in both lists.
  const openWorkspaces = allWorkspaces.filter(
    (w) => openWorkspaceIds.includes(w.id) && !pinnedWorkspaceIds.includes(w.id),
  )
  const hasSubWorkspaces = pinnedWorkspaces.length > 0 || openWorkspaces.length > 0

  // One-click capture: land on Notes and open the (app-level) composer expanded.
  const handleQuickNote = () => {
    navigate("/notes")
    openComposer()
  }

  // Dismiss an open workspace from the sidebar — and if it's the one being
  // viewed, leave its page for the all-workspaces view.
  const handleCloseWorkspace = (id: string) => {
    closeWorkspace(id)
    if (pathname === `/workspaces/${id}`) navigate("/workspaces")
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
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
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

        <div className={SidebarStyles.wsNavRow}>
          <NavLink 
            to="/notes" 
            className={() => itemClass(pathname === "/notes" && subView === "gallery")} 
            onClick={() => setNotesSubView("gallery")}
            title={collapsed ? "Notes" : undefined}
          >
            <span className={SidebarStyles.navIcon}>{ICONS.notes}</span>
            <span className={SidebarStyles.label}>Notes</span>
          </NavLink>
          {openCount > 0 && !collapsed && (
            <button
              type="button"
              className={`${SidebarStyles.wsDisclosure} ${notesExpanded ? "" : SidebarStyles.wsDisclosureCollapsed}`}
              onClick={() => setNotesExpanded((v) => !v)}
              aria-label={notesExpanded ? "Collapse notes" : "Expand notes"}
              aria-expanded={notesExpanded}
            >
              {ICONS.chevron}
            </button>
          )}
        </div>

        {openCount > 0 && (notesExpanded || collapsed) && (
          <div className={SidebarStyles.wsSub}>
            <NavLink
              to="/notes"
              className={() => `${itemClass(pathname === "/notes" && subView === "working")} ${SidebarStyles.subItem}`}
              onClick={(e) => {
                e.stopPropagation()
                setNotesSubView("working")
              }}
              title={collapsed ? "Working Notes" : undefined}
            >
              <span className={SidebarStyles.navIcon} aria-hidden="true"><PenLine size={16} /></span>
              <span className={`${SidebarStyles.label} ${SidebarStyles.workingLabel}`}>
                Working Notes
                <span className={SidebarStyles.workingBadge}>
                  {openCount}
                </span>
              </span>
            </NavLink>
          </div>
        )}

        {/* Workspaces entry carries the single disclosure toggle for its whole
            sub-tree (pinned + open), shown only when there's something to show. */}
        <div className={SidebarStyles.wsNavRow}>
          <NavLink to="/workspaces" className={({ isActive }) => itemClass(isActive)} title={collapsed ? "Workspaces" : undefined}>
            <span className={SidebarStyles.navIcon}>{ICONS.workspaces}</span>
            <span className={SidebarStyles.label}>Workspaces</span>
          </NavLink>
          {hasSubWorkspaces && !collapsed && (
            <button
              type="button"
              className={`${SidebarStyles.wsDisclosure} ${wsExpanded ? "" : SidebarStyles.wsDisclosureCollapsed}`}
              onClick={() => setWsExpanded((v) => !v)}
              aria-label={wsExpanded ? "Collapse workspaces" : "Expand workspaces"}
              aria-expanded={wsExpanded}
            >
              {ICONS.chevron}
            </button>
          )}
        </div>

        {hasSubWorkspaces && (wsExpanded || collapsed) && (
          <div className={SidebarStyles.wsSub}>
            {pinnedWorkspaces.map((w) => (
              <NavLink
                key={w.id}
                to={`/workspaces/${w.id}`}
                className={({ isActive }) => `${itemClass(isActive)} ${SidebarStyles.subItem}`}
                title={collapsed ? w.name : undefined}
              >
                <span className={SidebarStyles.navIcon} aria-hidden="true">{w.icon || <Folder size={16} />}</span>
                <span className={SidebarStyles.label}>{w.name}</span>
              </NavLink>
            ))}

            {/* Open workspaces — visited this run; each has a hover × to dismiss it
                from the sidebar (closeWorkspace). Labelled only when pinned ones
                also show, to separate the two groups. */}
            {openWorkspaces.length > 0 && (
              <>
                {pinnedWorkspaces.length > 0 && (
                  <span className={SidebarStyles.wsGroupLabel}>Open</span>
                )}
                {openWorkspaces.map((w) => (
                  <div key={w.id} className={SidebarStyles.openWsRow}>
                    <NavLink
                      to={`/workspaces/${w.id}`}
                      className={({ isActive }) => `${itemClass(isActive)} ${SidebarStyles.subItem} ${SidebarStyles.openWsLink}`}
                      title={collapsed ? w.name : undefined}
                    >
                      <span className={SidebarStyles.navIcon} aria-hidden="true">{w.icon || <Folder size={16} />}</span>
                      <span className={SidebarStyles.label}>{w.name}</span>
                    </NavLink>
                    <button
                      type="button"
                      className={SidebarStyles.openWsClose}
                      onClick={() => handleCloseWorkspace(w.id)}
                      title={`Close ${w.name}`}
                      aria-label={`Close ${w.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

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
                      {j.status === "running" ? <Hourglass size={14} /> : j.status === "done" ? <Check size={14} /> : <AlertTriangle size={14} />}
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
              {!collapsed && <span className={SidebarStyles.transcribeChevron}>{trayOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>}
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

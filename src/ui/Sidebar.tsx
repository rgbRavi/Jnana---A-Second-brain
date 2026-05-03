import { NavLink } from "react-router-dom"
import SidebarStyles from "./Sidebar.module.css"

export function Sidebar(){
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
          </nav>
        </aside>
    )
}
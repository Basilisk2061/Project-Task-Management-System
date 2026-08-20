import { NavLink } from 'react-router-dom'
import { DashboardIcon, FolderIcon, LogoutIcon, TasksIcon } from './AppIcons.jsx'

const navigation = [
  { to: '/app/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/app/projects', label: 'Projects', icon: FolderIcon },
  { to: '/app/tasks', label: 'My Tasks', icon: TasksIcon },
]

function Sidebar({ user, onLogout }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">TaskFlow</div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            key={to}
            to={to}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-details">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <button className="sidebar-logout" type="button" onClick={onLogout}>
          <LogoutIcon />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

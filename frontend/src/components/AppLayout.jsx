import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import api, { removeToken } from '../services/api.js'
import Sidebar from './Sidebar.jsx'

const pageTitles = {
  '/app/dashboard': 'Dashboard',
  '/app/projects': 'Projects',
  '/app/tasks': 'My Tasks',
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState(location.state?.authenticatedUser || null)

  useEffect(() => {
    if (user) return

    api
      .get('/api/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => {
        removeToken()
        navigate('/login', {
          replace: true,
          state: {
            authenticationError: 'Your session could not be verified. Please sign in again.',
          },
        })
      })
  }, [navigate, user])

  const logout = () => {
    removeToken()
    navigate('/login', { replace: true })
  }

  if (!user) {
    return (
      <main className="app-loading" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        <span>Loading your workspace...</span>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogout={logout} />
      <div className="app-workspace">
        <header className="app-header">
          <h1>{location.pathname.startsWith('/app/projects/') ? 'Project Details' : pageTitles[location.pathname] || 'TaskFlow'}</h1>
          <div className="app-header-user"><small>Signed in as</small><strong>{user.name}</strong></div>
        </header>
        <main className="app-content">
          <div className="page-transition" key={location.pathname}>
            <Outlet context={{ user }} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout

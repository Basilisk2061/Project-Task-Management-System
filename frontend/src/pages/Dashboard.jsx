import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProjectError, getProjects } from '../services/projects.js'
import { formatDate } from '../utils/date.js'
import { getMyTasks } from '../services/tasks.js'

function Dashboard() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([getProjects(), getMyTasks()])
      .then(([projectData, taskData]) => { if (active) { setProjects(projectData); setTasks(taskData) } })
      .catch((requestError) => {
        if (active) setError(getProjectError(requestError, 'Unable to load project data.'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const summaries = [
    { label: 'My Projects', value: loading ? '—' : projects.length },
    { label: 'My Tasks', value: loading ? '—' : tasks.length },
    { label: 'Completed', value: loading ? '—' : tasks.filter((task) => task.status === 'completed').length },
    { label: 'Pending', value: loading ? '—' : tasks.filter((task) => task.status !== 'completed').length },
  ]

  const upcomingTasks = tasks
    .filter((task) => task.due_date && task.status !== 'completed')
    .sort((first, second) => first.due_date.localeCompare(second.due_date))
    .slice(0, 5)

  return (
    <div className="dashboard-page">
      <p className="page-subtitle">Overview of your projects and assigned work.</p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <section className="summary-grid" aria-label="Work summary">
        {summaries.map(({ label, value }, index) => (
          <article className="summary-card" key={label} style={{ '--card-delay': `${index * 40 + 80}ms` }}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>
      <div className="dashboard-sections">
        <section className="dashboard-panel">
          <h2>My Projects</h2>
          {loading ? (
            <div className="empty-state"><span className="loading-spinner" aria-hidden="true" /><p>Loading projects...</p></div>
          ) : projects.length === 0 ? (
            <div className="empty-state"><strong>No projects yet.</strong><p>Projects you create or join will appear here.</p></div>
          ) : (
            <div className="dashboard-project-list">
              {projects.slice(0, 5).map((project) => (
                <Link key={project.id} to={`/app/projects/${project.id}`}><span>{project.name}</span><small>{project.deadline ? formatDate(project.deadline, { compact: true }) : 'No deadline'}</small></Link>
              ))}
            </div>
          )}
        </section>
        <section className="dashboard-panel">
          <h2>Upcoming Tasks</h2>
          {loading ? (
            <div className="empty-state"><span className="loading-spinner" aria-hidden="true" /><p>Loading tasks...</p></div>
          ) : upcomingTasks.length === 0 ? (
            <div className="empty-state"><strong>No upcoming tasks.</strong><p>Your assigned tasks with upcoming deadlines will appear here.</p></div>
          ) : (
            <div className="dashboard-task-list">
              {upcomingTasks.map((task) => (
                <Link key={task.id} to={`/app/projects/${task.project_id}`}>
                  <span><strong>{task.title}</strong><small>{task.project.name}</small></span>
                  <small className={task.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : ''}>{task.due_date < new Date().toISOString().slice(0, 10) ? 'Overdue' : `Due ${formatDate(task.due_date, { compact: true })}`}</small>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default Dashboard

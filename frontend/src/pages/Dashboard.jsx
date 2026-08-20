import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CalendarIcon, CheckCircleIcon, ClockIcon, FolderIcon, TasksIcon } from '../components/AppIcons.jsx'
import { getProjectError, getProjects } from '../services/projects.js'
import { getMyTasks } from '../services/tasks.js'
import { formatDate } from '../utils/date.js'

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', completed: 'Completed' }

function getLocalDateValue() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function getDueDetails(dueDate, today) {
  if (!dueDate) return { label: 'No due date', state: '' }
  if (dueDate < today) return { label: 'Overdue', state: 'overdue' }
  if (dueDate === today) return { label: 'Due today', state: 'due-today' }
  return { label: `Due ${formatDate(dueDate, { compact: true })}`, state: '' }
}

function Dashboard() {
  const { user } = useOutletContext()
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

  const completedTasks = tasks.filter((task) => task.status === 'completed')
  const pendingTasks = tasks.filter((task) => task.status !== 'completed')
  const summaries = [
    { label: 'My Projects', value: loading ? '—' : projects.length, context: 'Projects you can access', icon: FolderIcon },
    { label: 'My Tasks', value: loading ? '—' : tasks.length, context: 'Assigned to you', icon: TasksIcon },
    { label: 'Completed', value: loading ? '—' : completedTasks.length, context: 'Tasks completed', icon: CheckCircleIcon },
    { label: 'Pending', value: loading ? '—' : pendingTasks.length, context: 'Still in progress', icon: ClockIcon },
  ]
  const today = getLocalDateValue()
  const upcomingTasks = pendingTasks
    .filter((task) => task.due_date)
    .sort((first, second) => first.due_date.localeCompare(second.due_date))
    .slice(0, 5)
  const activeTasks = pendingTasks
    .sort((first, second) => {
      if (first.status !== second.status) return first.status === 'in_progress' ? -1 : 1
      return (first.due_date || '9999-12-31').localeCompare(second.due_date || '9999-12-31')
    })
    .slice(0, 4)

  return (
    <div className="dashboard-page">
      <div className="dashboard-intro"><p className="page-subtitle">Track your projects, tasks, and upcoming work.</p></div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <section className="summary-grid" aria-label="Work summary">
        {summaries.map(({ label, value, context, icon: Icon }, index) => (
          <article className="summary-card" key={label} style={{ '--card-delay': `${index * 45 + 70}ms` }}>
            <div className="summary-card-heading"><span>{label}</span><Icon /></div>
            <strong>{value}</strong>
            <small>{context}</small>
          </article>
        ))}
      </section>

      <div className="dashboard-work-grid">
        <section className="dashboard-panel dashboard-projects-panel">
          <header className="dashboard-panel-header">
            <div><h2>My Projects</h2><p>Projects you own or collaborate on</p></div>
            <Link to="/app/projects">View all</Link>
          </header>
          {loading ? (
            <div className="dashboard-empty-state"><span className="loading-spinner" aria-hidden="true" /><p>Loading projects...</p></div>
          ) : projects.length === 0 ? (
            <div className="dashboard-empty-state"><FolderIcon /><strong>No projects yet</strong><p>Projects you create or join will appear here.</p></div>
          ) : (
            <div className="dashboard-project-list">
              {projects.slice(0, 5).map((project, index) => {
                const assignedTaskCount = tasks.filter((task) => task.project_id === project.id).length
                return (
                  <Link key={project.id} to={`/app/projects/${project.id}`} style={{ '--row-delay': `${Math.min(index, 5) * 40 + 120}ms` }}>
                    <span className="dashboard-row-icon"><FolderIcon /></span>
                    <span className="dashboard-project-main">
                      <span className="dashboard-row-title"><strong>{project.name}</strong><small>{project.created_by === user.id ? 'Owner' : 'Member'}</small></span>
                      <span className="dashboard-row-description">{project.description || 'No description provided.'}</span>
                    </span>
                    <span className="dashboard-project-meta">
                      <small>{project.deadline ? `Deadline ${formatDate(project.deadline, { compact: true })}` : 'No deadline'}</small>
                      <small>{assignedTaskCount} assigned {assignedTaskCount === 1 ? 'task' : 'tasks'}</small>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="dashboard-side-stack">
          <section className="dashboard-panel">
            <header className="dashboard-panel-header">
              <div><h2>Upcoming Tasks</h2><p>Nearest assigned deadlines</p></div>
              <Link to="/app/tasks">View tasks</Link>
            </header>
            {loading ? (
              <div className="dashboard-empty-state compact"><span className="loading-spinner" aria-hidden="true" /><p>Loading tasks...</p></div>
            ) : upcomingTasks.length === 0 ? (
              <div className="dashboard-empty-state compact"><CalendarIcon /><strong>No upcoming tasks</strong><p>Assigned tasks with deadlines will appear here.</p></div>
            ) : (
              <div className="dashboard-task-list">
                {upcomingTasks.map((task, index) => {
                  const due = getDueDetails(task.due_date, today)
                  return (
                    <Link key={task.id} to={`/app/projects/${task.project_id}`} style={{ '--row-delay': `${Math.min(index, 5) * 35 + 120}ms` }}>
                      <span className="dashboard-task-main"><strong>{task.title}</strong><small>{task.project.name}</small></span>
                      <span className="dashboard-task-meta"><small className={`dashboard-priority ${task.priority}`}>{task.priority}</small><small className={due.state}>{due.label}</small></span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          <section className="dashboard-panel">
            <header className="dashboard-panel-header"><div><h2>Active Work</h2><p>Tasks currently awaiting completion</p></div></header>
            {loading ? (
              <div className="dashboard-empty-state compact"><span className="loading-spinner" aria-hidden="true" /><p>Loading active work...</p></div>
            ) : activeTasks.length === 0 ? (
              <div className="dashboard-empty-state compact"><CheckCircleIcon /><strong>All caught up</strong><p>You have no active assigned tasks.</p></div>
            ) : (
              <div className="dashboard-task-list">
                {activeTasks.map((task, index) => (
                  <Link key={task.id} to={`/app/projects/${task.project_id}`} style={{ '--row-delay': `${Math.min(index, 4) * 35 + 120}ms` }}>
                    <span className="dashboard-task-main"><strong>{task.title}</strong><small>{task.project.name}</small></span>
                    <span className={`dashboard-status ${task.status}`}>{STATUS_LABELS[task.status]}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

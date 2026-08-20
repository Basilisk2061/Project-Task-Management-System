import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { FolderIcon, PlusIcon } from '../components/AppIcons.jsx'
import ProjectFormModal from '../components/ProjectFormModal.jsx'
import { ProjectGridSkeleton } from '../components/Skeleton.jsx'
import { useToast } from '../components/ToastProvider.jsx'
import { createProject, getProjectError, getProjects } from '../services/projects.js'
import { formatCreatedDate, formatDate } from '../utils/date.js'

function Projects() {
  const { user } = useOutletContext()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const visibleProjects = statusFilter === 'all' ? projects : projects.filter((project) => project.status === statusFilter)

  useEffect(() => {
    let active = true
    getProjects()
      .then((data) => { if (active) setProjects(data) })
      .catch((requestError) => {
        if (active) setError(getProjectError(requestError, 'Unable to load projects.'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="projects-page">
      <div className="page-toolbar">
        <p className="page-subtitle">Manage your projects and keep work organized.</p>
        <div className="projects-toolbar-actions">
          <label className="project-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="completed">Completed</option></select></label>
          <button className="btn taskflow-button primary" type="button" onClick={() => setCreateModalOpen(true)}><PlusIcon /><span>New Project</span></button>
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {loading ? (
        <ProjectGridSkeleton />
      ) : projects.length === 0 ? (
        <section className="projects-empty-state">
          <FolderIcon />
          <h2>No projects yet</h2>
          <p>Create your first project to start organizing your work.</p>
          <button className="btn taskflow-button primary" type="button" onClick={() => setCreateModalOpen(true)}><PlusIcon /><span>New Project</span></button>
        </section>
      ) : visibleProjects.length === 0 ? (
        <section className="projects-empty-state compact"><FolderIcon /><h2>No {statusFilter} projects</h2><p>Try a different status filter.</p></section>
      ) : (
        <section className="project-grid" aria-label="Your projects">
          {visibleProjects.map((project, index) => (
            <article className={`project-card${project.status === 'completed' ? ' completed' : ''}`} key={project.id} style={{ '--project-delay': `${Math.min(index, 6) * 40}ms` }}>
              <div className="project-card-body">
                <div className="project-card-title"><h2>{project.name}</h2><div className="project-card-badges"><span className={`project-status-badge ${project.status}`}>{project.status === 'completed' ? 'Completed' : 'Active'}</span><span>{project.created_by === user.id ? 'Owner' : 'Member'}</span></div></div>
                <p>{project.description || 'No description provided.'}</p>
                <dl className="project-card-dates">
                  <div><dt>Start</dt><dd>{formatDate(project.start_date)}</dd></div>
                  <div><dt>Deadline</dt><dd>{formatDate(project.deadline)}</dd></div>
                  <div><dt>Created</dt><dd>{formatCreatedDate(project.created_at)}</dd></div>
                </dl>
              </div>
              <Link className="project-open-link" to={`/app/projects/${project.id}`}>Open Project</Link>
            </article>
          ))}
        </section>
      )}

      <ProjectFormModal isOpen={createModalOpen} mode="create"
        onClose={() => setCreateModalOpen(false)} onSubmit={createProject}
        onSaved={(project) => {
          setProjects((current) => [project, ...current])
          showToast('Project created.')
        }} />
    </div>
  )
}

export default Projects

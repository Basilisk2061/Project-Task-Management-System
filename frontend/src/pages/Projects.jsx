import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { FolderIcon, PlusIcon } from '../components/AppIcons.jsx'
import ProjectFormModal from '../components/ProjectFormModal.jsx'
import { createProject, getProjectError, getProjects } from '../services/projects.js'
import { formatCreatedDate, formatDate } from '../utils/date.js'

function Projects() {
  const { user } = useOutletContext()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)

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
        <button className="btn taskflow-button primary" type="button" onClick={() => setCreateModalOpen(true)}>
          <PlusIcon /><span>New Project</span>
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {loading ? (
        <div className="content-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><span>Loading projects...</span></div>
      ) : projects.length === 0 ? (
        <section className="projects-empty-state">
          <FolderIcon />
          <h2>No projects yet</h2>
          <p>Create your first project to start organizing your work.</p>
          <button className="btn taskflow-button primary" type="button" onClick={() => setCreateModalOpen(true)}><PlusIcon /><span>New Project</span></button>
        </section>
      ) : (
        <section className="project-grid" aria-label="Your projects">
          {projects.map((project, index) => (
            <article className="project-card" key={project.id} style={{ '--project-delay': `${Math.min(index, 6) * 40}ms` }}>
              <div className="project-card-body">
                <div className="project-card-title"><h2>{project.name}</h2><span>{project.created_by === user.id ? 'Owner' : 'Member'}</span></div>
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
        onSaved={(project) => setProjects((current) => [project, ...current])} />
    </div>
  )
}

export default Projects

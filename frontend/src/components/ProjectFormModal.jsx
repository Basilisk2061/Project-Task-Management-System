import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './AppIcons.jsx'
import { getProjectError } from '../services/projects.js'
import { useToast } from './ToastProvider.jsx'

const emptyForm = { name: '', description: '', start_date: '', deadline: '' }

function ProjectFormModal({ isOpen, mode, project, onClose, onSubmit, onSaved }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(project ? {
      name: project.name || '',
      description: project.description || '',
      start_date: project.start_date || '',
      deadline: project.deadline || '',
    } : emptyForm)
    setError('')
    setClosing(false)
  }, [isOpen, project])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  const finishClose = (afterClose) => {
    if (submitting || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      afterClose?.()
      onClose()
    }, 260)
  }

  useEffect(() => {
    if (!isOpen) return undefined
    const handleEscape = (event) => {
      if (event.key === 'Escape') finishClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  })

  if (!isOpen) return null

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Project name is required.')
      return
    }
    if (form.start_date && form.deadline && form.deadline < form.start_date) {
      setError('Deadline cannot be before start date.')
      return
    }

    setSubmitting(true)
    try {
      const savedProject = await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        deadline: form.deadline || null,
      })
      setSubmitting(false)
      finishClose(() => onSaved(savedProject))
    } catch (requestError) {
      const message = getProjectError(
        requestError,
        mode === 'create' ? 'Unable to create project.' : 'Unable to save project.',
      )
      setError(message)
      showToast(message, { type: 'error' })
      setSubmitting(false)
    }
  }

  const title = mode === 'create' ? 'New Project' : 'Edit Project'
  const submitLabel = mode === 'create' ? 'Create Project' : 'Save Changes'
  const loadingLabel = mode === 'create' ? 'Creating...' : 'Saving...'

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <header className="modal-header-custom">
          <div>
            <h2 id="project-modal-title">{title}</h2>
            <p>{mode === 'create' ? 'Add the basic details for your project.' : 'Update the project details below.'}</p>
          </div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={submitting}>
            <CloseIcon />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <div className="mb-3">
            <label className="form-label" htmlFor="project-name">Project Name *</label>
            <input className="form-control" id="project-name" name="name" value={form.name}
              onChange={updateField} maxLength="200" autoFocus required />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="project-description">Description</label>
            <textarea className="form-control" id="project-description" name="description"
              rows="4" value={form.description} onChange={updateField} />
          </div>
          <div className="modal-date-grid">
            <div>
              <label className="form-label" htmlFor="project-start-date">Start Date</label>
              <input className="form-control" id="project-start-date" name="start_date" type="date"
                value={form.start_date} onChange={updateField} />
            </div>
            <div>
              <label className="form-label" htmlFor="project-deadline">Deadline</label>
              <input className="form-control" id="project-deadline" name="deadline" type="date"
                value={form.deadline} onChange={updateField} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-light taskflow-button" type="button" onClick={() => finishClose()} disabled={submitting}>Cancel</button>
            <button className="btn taskflow-button primary" type="submit" disabled={submitting}>
              {submitting && <span className="button-spinner" aria-hidden="true" />}
              {submitting ? loadingLabel : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default ProjectFormModal

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './AppIcons.jsx'
import { getTaskError } from '../services/tasks.js'

const emptyForm = { title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' }

function TaskFormModal({ isOpen, mode, task, members, onClose, onSubmit, onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(task ? {
      title: task.title || '', description: task.description || '', priority: task.priority,
      assigned_to: task.assigned_to ?? '', due_date: task.due_date || '',
    } : emptyForm)
    setError('')
    setClosing(false)
  }, [isOpen, task])

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!isOpen) return undefined
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = oldOverflow }
  }, [isOpen])

  const finishClose = (afterClose) => {
    if (submitting || closing) return
    setClosing(true)
    timer.current = window.setTimeout(() => { afterClose?.(); onClose() }, 260)
  }

  if (!isOpen) return null

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) { setError('Task title is required.'); return }
    setError('')
    setSubmitting(true)
    try {
      const saved = await onSubmit({
        title: form.title.trim(), description: form.description.trim() || null,
        priority: form.priority, assigned_to: form.assigned_to === '' ? null : Number(form.assigned_to),
        due_date: form.due_date || null,
      })
      setSubmitting(false)
      finishClose(() => onSaved(saved))
    } catch (requestError) {
      setError(getTaskError(requestError, mode === 'create' ? 'Unable to create task.' : 'Unable to save task.'))
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) finishClose() }}>
      <section className="taskflow-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <header className="modal-header-custom">
          <div><h2 id="task-modal-title">{mode === 'create' ? 'New Task' : 'Edit Task'}</h2><p>{mode === 'create' ? 'Add work to this project.' : 'Update the task details below.'}</p></div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={submitting}><CloseIcon /></button>
        </header>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <div className="mb-3"><label className="form-label" htmlFor="task-title">Task Title *</label><input className="form-control" id="task-title" name="title" value={form.title} onChange={updateField} maxLength="200" autoFocus required /></div>
          <div className="mb-3"><label className="form-label" htmlFor="task-description">Description</label><textarea className="form-control" id="task-description" name="description" rows="3" value={form.description} onChange={updateField} /></div>
          <div className="task-form-grid">
            <div><label className="form-label" htmlFor="task-priority">Priority</label><select className="form-select" id="task-priority" name="priority" value={form.priority} onChange={updateField}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
            <div><label className="form-label" htmlFor="task-assignee">Assignee</label><select className="form-select" id="task-assignee" name="assigned_to" value={form.assigned_to} onChange={updateField}><option value="">Unassigned</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}{member.role === 'Owner' ? ' (Owner)' : ''}</option>)}</select></div>
          </div>
          <div className="mt-3"><label className="form-label" htmlFor="task-due-date">Due Date</label><input className="form-control" id="task-due-date" name="due_date" type="date" value={form.due_date} onChange={updateField} /></div>
          <div className="modal-actions"><button className="btn btn-light taskflow-button" type="button" onClick={() => finishClose()} disabled={submitting}>Cancel</button><button className="btn taskflow-button primary" type="submit" disabled={submitting}>{submitting && <span className="button-spinner" aria-hidden="true" />}{submitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : (mode === 'create' ? 'Create Task' : 'Save Changes')}</button></div>
        </form>
      </section>
    </div>, document.body,
  )
}

export default TaskFormModal

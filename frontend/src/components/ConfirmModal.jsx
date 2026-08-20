import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './AppIcons.jsx'
import { getProjectError } from '../services/projects.js'
import { useToast } from './ToastProvider.jsx'

function ConfirmModal({
  isOpen,
  projectName,
  title = 'Delete project?',
  message,
  confirmLabel = 'Delete Project',
  loadingLabel = 'Deleting...',
  fallbackError = 'Unable to delete project.',
  onClose,
  onConfirm,
  onConfirmed,
}) {
  const { showToast } = useToast()
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const closeTimer = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setClosing(false)
      setDeleting(false)
      setError('')
    }
  }, [isOpen])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  const finishClose = (afterClose) => {
    if (deleting || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      afterClose?.()
      onClose()
    }, 260)
  }

  if (!isOpen) return null

  const confirmDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onConfirm()
      setDeleting(false)
      finishClose(onConfirmed)
    } catch (requestError) {
      const message = getProjectError(requestError, fallbackError)
      setError(message)
      showToast(message, { type: 'error' })
      setDeleting(false)
    }
  }

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <header className="modal-header-custom">
          <div>
            <h2 id="delete-modal-title">{title}</h2>
            <p>{message || `This will permanently delete “${projectName}”.`}</p>
          </div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={deleting}><CloseIcon /></button>
        </header>
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-light taskflow-button" type="button" onClick={() => finishClose()} disabled={deleting}>Cancel</button>
          <button className="btn taskflow-button danger" type="button" onClick={confirmDelete} disabled={deleting}>
            {deleting && <span className="button-spinner" aria-hidden="true" />}
            {deleting ? loadingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default ConfirmModal

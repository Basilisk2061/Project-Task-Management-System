import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, FileIcon } from './AppIcons.jsx'
import { getDocumentError, uploadProjectDocument } from '../services/documents.js'

const MAX_PDF_SIZE = 10 * 1024 * 1024
const PDF_CONTENT_TYPES = ['application/pdf', 'application/x-pdf']

function validatePdf(file) {
  if (!file) return 'Select a PDF file.'
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'Only PDF files are allowed.'
  if (file.type && !PDF_CONTENT_TYPES.includes(file.type)) return 'The selected file must be a PDF.'
  if (file.size > MAX_PDF_SIZE) return 'PDF must be 10 MB or smaller.'
  return ''
}

function DocumentUploadModal({ isOpen, projectId, onClose, onSaved }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setSelectedFile(null)
    setError('')
    setUploading(false)
    setClosing(false)
  }, [isOpen])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  const finishClose = (afterClose) => {
    if (uploading || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      onClose()
      afterClose?.()
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

  const selectFile = (event) => {
    const file = event.target.files?.[0] || null
    setSelectedFile(file)
    setError(file ? validatePdf(file) : '')
  }

  const uploadPdf = async (event) => {
    event.preventDefault()
    const validationError = validatePdf(selectedFile)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setError('')
    try {
      const savedDocument = await uploadProjectDocument(projectId, selectedFile)
      setUploading(false)
      finishClose(() => onSaved(savedDocument))
    } catch (requestError) {
      setError(await getDocumentError(requestError, 'Unable to upload PDF.'))
      setUploading(false)
    }
  }

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal document-upload-modal" role="dialog" aria-modal="true" aria-labelledby="document-upload-title">
        <header className="modal-header-custom">
          <div><h2 id="document-upload-title">Upload Project Document</h2><p>Add a PDF to this project workspace.</p></div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={uploading}><CloseIcon /></button>
        </header>
        <form onSubmit={uploadPdf}>
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <label className="form-label" htmlFor="project-document-file">PDF File</label>
          <label className="document-file-picker" htmlFor="project-document-file">
            <FileIcon />
            <span><strong>Select PDF</strong><small>{selectedFile?.name || 'No file selected'}</small></span>
          </label>
          <input className="visually-hidden" id="project-document-file" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={uploading} />
          <p className="document-upload-help">PDF files up to 10 MB.</p>
          <div className="modal-actions">
            <button className="btn btn-light taskflow-button" type="button" onClick={() => finishClose()} disabled={uploading}>Cancel</button>
            <button className="btn taskflow-button primary" type="submit" disabled={uploading || !selectedFile}>{uploading && <span className="button-spinner" aria-hidden="true" />}{uploading ? 'Uploading...' : 'Upload PDF'}</button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default DocumentUploadModal

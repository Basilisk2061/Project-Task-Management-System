import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, ExpandIcon } from './AppIcons.jsx'
import {
  askProjectAssistant,
  getProjectAssistantStatus,
  getRagError,
  prepareProjectAssistant,
} from '../services/rag.js'

const STATUS_LABELS = {
  checking: 'Not prepared',
  missing: 'Not prepared',
  preparing: 'Preparing...',
  ready: 'Ready',
  stale: 'Needs update',
  error: 'Not prepared',
}

function deduplicateSources(sources = []) {
  return Array.from(new Map(sources.map((source) => [
    source.document_id ?? `file:${source.file_name}`,
    source,
  ])).values())
}

function ProjectAssistant({
  projectId,
  projectName,
  documents,
  documentsLoading,
  documentRevision,
  onOpenDocument,
}) {
  const [assistantStatus, setAssistantStatus] = useState('checking')
  const [preparing, setPreparing] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [closingExpanded, setClosingExpanded] = useState(false)
  const messageAreaRef = useRef(null)
  const messageIdRef = useRef(0)
  const statusRequestRef = useRef(0)
  const askRequestRef = useRef(0)
  const revisionRef = useRef(documentRevision)
  const expandButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const closeTimerRef = useRef(null)

  revisionRef.current = documentRevision

  const checkStatus = async (expectedRevision = revisionRef.current) => {
    const requestId = statusRequestRef.current + 1
    statusRequestRef.current = requestId
    setAssistantStatus('checking')
    setError('')
    try {
      const result = await getProjectAssistantStatus(projectId)
      if (statusRequestRef.current === requestId && revisionRef.current === expectedRevision) {
        setAssistantStatus(result.status)
      }
    } catch (requestError) {
      if (statusRequestRef.current !== requestId) return
      setAssistantStatus('error')
      setError(getRagError(requestError, 'Unable to check the Project Assistant status.'))
    }
  }

  useEffect(() => {
    askRequestRef.current += 1
    setMessages([])
    setQuestion('')
    setAsking(false)
    setExpanded(false)
    checkStatus(documentRevision)
    return () => { statusRequestRef.current += 1 }
  }, [projectId])

  useEffect(() => {
    if (documentRevision === 0) return
    statusRequestRef.current += 1
    askRequestRef.current += 1
    setAssistantStatus(documents.length === 0 ? 'missing' : 'stale')
    setMessages([])
    setQuestion('')
    setAsking(false)
    setError('')
  }, [documentRevision, documents.length])

  useEffect(() => {
    const messageArea = messageAreaRef.current
    if (!messageArea) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    messageArea.scrollTo({
      top: messageArea.scrollHeight,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [messages, asking, expanded])

  useEffect(() => {
    if (!expanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  const effectiveStatus = !documentsLoading && documents.length === 0 ? 'missing' : assistantStatus
  const statusLabel = STATUS_LABELS[preparing ? 'preparing' : effectiveStatus]

  const prepareAssistant = async () => {
    const expectedRevision = revisionRef.current
    setPreparing(true)
    setAssistantStatus('preparing')
    setError('')
    try {
      await prepareProjectAssistant(projectId)
      if (revisionRef.current === expectedRevision) {
        setAssistantStatus('ready')
        setMessages([])
      }
    } catch (requestError) {
      if (revisionRef.current === expectedRevision) {
        setAssistantStatus(effectiveStatus === 'stale' ? 'stale' : 'missing')
        setError(getRagError(requestError, 'Unable to prepare the Project Assistant.'))
      }
    } finally {
      setPreparing(false)
    }
  }

  const submitQuestion = async (event) => {
    event.preventDefault()
    const cleanedQuestion = question.trim()
    if (!cleanedQuestion || asking || effectiveStatus !== 'ready') return

    const requestId = askRequestRef.current + 1
    askRequestRef.current = requestId
    messageIdRef.current += 1
    const userMessage = { id: `user-${messageIdRef.current}`, role: 'user', text: cleanedQuestion }
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setAsking(true)
    setError('')
    try {
      const result = await askProjectAssistant(projectId, cleanedQuestion)
      if (askRequestRef.current !== requestId) return
      messageIdRef.current += 1
      setMessages((current) => [...current, {
        id: `assistant-${messageIdRef.current}`,
        role: 'assistant',
        text: result.answer,
        grounded: result.grounded,
        sources: deduplicateSources(result.sources),
      }])
    } catch (requestError) {
      if (askRequestRef.current !== requestId) return
      const responseStatus = requestError.response?.status
      if (responseStatus === 409) {
        try {
          const currentStatus = await getProjectAssistantStatus(projectId)
          setAssistantStatus(currentStatus.status)
        } catch {
          setAssistantStatus('error')
        }
        setError('The Project Assistant needs to be prepared before answering questions.')
      } else if (responseStatus === 502 || responseStatus === 504) {
        setError('The Project Assistant is temporarily unavailable. Please try again.')
      } else if (responseStatus === 404) {
        setError('Project unavailable.')
      } else {
        setError(getRagError(requestError, 'Unable to ask the Project Assistant.'))
      }
    } finally {
      if (askRequestRef.current === requestId) setAsking(false)
    }
  }

  const openExpanded = () => {
    setClosingExpanded(false)
    setExpanded(true)
  }

  const closeExpanded = () => {
    if (closingExpanded) return
    setClosingExpanded(true)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimerRef.current = window.setTimeout(() => {
      setExpanded(false)
      setClosingExpanded(false)
      window.requestAnimationFrame(() => expandButtonRef.current?.focus())
    }, reducedMotion ? 0 : 220)
  }

  useEffect(() => {
    if (!expanded) return undefined
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeExpanded()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [expanded, closingExpanded])

  const openSource = (source) => {
    const sourceDocument = documents.find((document) => (
      source.document_id != null
        ? document.id === source.document_id
        : document.file_name === source.file_name
    ))
    if (sourceDocument) onOpenDocument(sourceDocument)
  }

  const handleQuestionKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const renderPanel = (expandedMode = false) => (
    <section
      className={`project-assistant-card${expandedMode ? ' expanded' : ''}`}
      aria-labelledby={expandedMode ? 'expanded-project-assistant-title' : 'project-assistant-title'}
      {...(expandedMode ? { role: 'dialog', 'aria-modal': true } : {})}
    >
      <header className="project-assistant-header">
        <div>
          <h2 id={expandedMode ? 'expanded-project-assistant-title' : 'project-assistant-title'}>Project Assistant</h2>
          <p>{expandedMode ? projectName : 'Ask questions about this project\'s documents.'}</p>
        </div>
        <div className="assistant-header-actions">
          <span className={`assistant-status ${preparing ? 'preparing' : effectiveStatus}`} aria-live="polite">
            {statusLabel}
          </span>
          {expandedMode ? (
            <button ref={closeButtonRef} className="assistant-icon-button" type="button" onClick={closeExpanded} aria-label="Close Project Assistant">
              <CloseIcon />
            </button>
          ) : (
            <button ref={expandButtonRef} className="assistant-icon-button" type="button" onClick={openExpanded} aria-label="Expand Project Assistant">
              <ExpandIcon />
            </button>
          )}
        </div>
      </header>

      {error && <div className="assistant-error" role="alert">{error}</div>}

      <div className="project-assistant-body" key={effectiveStatus}>
        {documentsLoading || effectiveStatus === 'checking' ? (
          <div className="assistant-state"><span className="loading-spinner" aria-hidden="true" /><span>Checking assistant status...</span></div>
        ) : documents.length === 0 ? (
          <div className="assistant-empty-state">
            <strong>No project documents available.</strong>
            <span>Upload a PDF to use the Project Assistant.</span>
          </div>
        ) : effectiveStatus === 'missing' || effectiveStatus === 'error' ? (
          <div className="assistant-prepare-state">
            <div><strong>The assistant needs to prepare the project documents before questions can be answered.</strong></div>
            <button className="btn taskflow-button primary" type="button" onClick={effectiveStatus === 'error' ? () => checkStatus() : prepareAssistant} disabled={preparing}>
              {effectiveStatus === 'error' ? 'Check Again' : preparing ? 'Preparing...' : 'Prepare Assistant'}
            </button>
          </div>
        ) : effectiveStatus === 'stale' ? (
          <div className="assistant-prepare-state">
            <div><strong>Project documents have changed.</strong><span>Update the assistant before asking questions.</span></div>
            <button className="btn taskflow-button primary" type="button" onClick={prepareAssistant} disabled={preparing}>
              {preparing ? 'Preparing...' : 'Update Assistant'}
            </button>
          </div>
        ) : effectiveStatus === 'preparing' ? (
          <div className="assistant-state"><span className="loading-spinner" aria-hidden="true" /><span>Preparing project documents...</span></div>
        ) : (
          <div className="assistant-chat">
            <div className="assistant-message-area" ref={messageAreaRef} aria-live="polite">
              {messages.length === 0 && !asking ? (
                <div className="assistant-chat-empty">
                  <strong>Ask a question about the project documents.</strong>
                  <span>Answers will be based only on PDFs uploaded to this project.</span>
                </div>
              ) : messages.map((message) => (
                <article className={`assistant-message ${message.role}`} key={message.id}>
                  <span className="assistant-message-label">{message.role === 'user' ? 'You' : 'Project Assistant'}</span>
                  <p>{message.text}</p>
                  {message.role === 'assistant' && message.grounded && message.sources.length > 0 && (
                    <div className="assistant-sources">
                      <strong>{message.sources.length === 1 ? 'Source' : 'Sources'}</strong>
                      {message.sources.map((source) => (
                        <button key={source.document_id ?? source.file_name} type="button" onClick={() => openSource(source)}>
                          {source.file_name}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {asking && <div className="assistant-thinking"><span className="loading-spinner" aria-hidden="true" /><span>Thinking...</span></div>}
            </div>
            <form className="assistant-question-form" onSubmit={submitQuestion}>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                placeholder="Ask about project documents..."
                maxLength={1000}
                rows={3}
                disabled={asking}
                aria-label="Question for Project Assistant"
              />
              <button className="btn taskflow-button primary" type="submit" disabled={asking || !question.trim()}>
                {asking ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  )

  if (expanded) {
    return createPortal(
      <div className={`assistant-expanded-layer${closingExpanded ? ' closing' : ''}`} onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeExpanded()
      }}>
        {renderPanel(true)}
      </div>,
      document.body,
    )
  }

  return renderPanel()
}

export default ProjectAssistant

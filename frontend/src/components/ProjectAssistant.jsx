import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, ExpandIcon, HistoryIcon, PlusIcon, TrashIcon } from './AppIcons.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import {
  askProjectAssistant,
  createProjectAssistantConversation,
  deleteProjectAssistantConversation,
  getProjectAssistantConversations,
  getProjectAssistantHistory,
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

function formatConversationDate(value) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ProjectAssistant({
  projectId,
  projectName,
  currentUser,
  projectOwnerId,
  documents,
  documentsLoading,
  documentRevision,
  onOpenDocument,
}) {
  const [assistantStatus, setAssistantStatus] = useState('checking')
  const [preparing, setPreparing] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [closingExpanded, setClosingExpanded] = useState(false)
  const messageAreaRef = useRef(null)
  const messageIdRef = useRef(0)
  const statusRequestRef = useRef(0)
  const historyRequestRef = useRef(0)
  const askRequestRef = useRef(0)
  const activeConversationRef = useRef(null)
  const askingRef = useRef(false)
  const revisionRef = useRef(documentRevision)
  const expandButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const historyButtonRef = useRef(null)
  const historyPanelRef = useRef(null)
  const closeTimerRef = useRef(null)

  revisionRef.current = documentRevision
  activeConversationRef.current = activeConversationId

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

  const loadHistory = async (conversationId) => {
    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const history = await getProjectAssistantHistory(projectId, conversationId)
      if (historyRequestRef.current !== requestId || activeConversationRef.current !== conversationId) return
      setMessages(history.map((message) => ({
        id: `stored-${message.id}`,
        role: message.role,
        text: message.content,
        grounded: message.grounded,
        sources: deduplicateSources(message.sources),
        authorId: message.user.id,
        authorName: message.user.name,
      })))
    } catch (requestError) {
      if (historyRequestRef.current !== requestId) return
      setHistoryError(getRagError(requestError, 'Unable to load the Assistant conversation.'))
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false)
    }
  }

  const loadConversations = async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const available = await getProjectAssistantConversations(projectId)
      setConversations(available)
      const selectedId = available[0]?.id ?? null
      activeConversationRef.current = selectedId
      setActiveConversationId(selectedId)
      if (selectedId) await loadHistory(selectedId)
      else {
        setMessages([])
        setHistoryLoading(false)
      }
    } catch (requestError) {
      setHistoryLoading(false)
      setHistoryError(getRagError(requestError, 'Unable to load Assistant conversations.'))
    }
  }

  useEffect(() => {
    askRequestRef.current += 1
    setMessages([])
    setConversations([])
    setActiveConversationId(null)
    activeConversationRef.current = null
    setHistoryOpen(false)
    setQuestion('')
    setAsking(false)
    askingRef.current = false
    setExpanded(false)
    checkStatus(documentRevision)
    loadConversations()
    return () => {
      statusRequestRef.current += 1
      historyRequestRef.current += 1
      askRequestRef.current += 1
      askingRef.current = false
    }
  }, [projectId])

  useEffect(() => {
    if (documentRevision === 0) return
    statusRequestRef.current += 1
    askRequestRef.current += 1
    setAssistantStatus(documents.length === 0 ? 'missing' : 'stale')
    setQuestion('')
    setAsking(false)
    askingRef.current = false
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

  useEffect(() => {
    if (!historyOpen) return undefined

    const handleOutsidePointer = (event) => {
      if (
        historyPanelRef.current?.contains(event.target)
        || historyButtonRef.current?.contains(event.target)
      ) return
      setHistoryOpen(false)
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [historyOpen])

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

  const createConversation = async () => {
    if (creatingConversation) return
    setCreatingConversation(true)
    setHistoryError('')
    try {
      const conversation = await createProjectAssistantConversation(projectId)
      askRequestRef.current += 1
      historyRequestRef.current += 1
      askingRef.current = false
      setAsking(false)
      activeConversationRef.current = conversation.id
      setActiveConversationId(conversation.id)
      setConversations((current) => [conversation, ...current])
      setMessages([])
      setQuestion('')
      setHistoryLoading(false)
      setHistoryOpen(false)
    } catch (requestError) {
      setHistoryError(getRagError(requestError, 'Unable to create a new conversation.'))
    } finally {
      setCreatingConversation(false)
    }
  }

  const selectConversation = (conversationId) => {
    if (conversationId === activeConversationRef.current) {
      setHistoryOpen(false)
      return
    }
    askRequestRef.current += 1
    askingRef.current = false
    setAsking(false)
    activeConversationRef.current = conversationId
    setActiveConversationId(conversationId)
    setMessages([])
    setQuestion('')
    setHistoryOpen(false)
    loadHistory(conversationId)
  }

  const finishConversationDeletion = (deletedConversation) => {
    const remaining = conversations.filter((conversation) => conversation.id !== deletedConversation.id)
    setConversations(remaining)
    setConversationToDelete(null)
    if (activeConversationRef.current !== deletedConversation.id) return
    askRequestRef.current += 1
    const nextId = remaining[0]?.id ?? null
    activeConversationRef.current = nextId
    setActiveConversationId(nextId)
    setMessages([])
    if (nextId) loadHistory(nextId)
    else setHistoryLoading(false)
  }

  const submitQuestion = async (event) => {
    event.preventDefault()
    const cleanedQuestion = question.trim()
    const conversationId = activeConversationRef.current
    if (!conversationId || !cleanedQuestion || askingRef.current || historyLoading || effectiveStatus !== 'ready') return

    const requestId = askRequestRef.current + 1
    askRequestRef.current = requestId
    messageIdRef.current += 1
    const userMessage = {
      id: `user-${messageIdRef.current}`,
      role: 'user',
      text: cleanedQuestion,
      authorId: currentUser.id,
      authorName: currentUser.name,
    }
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setAsking(true)
    askingRef.current = true
    setError('')
    try {
      const result = await askProjectAssistant(projectId, conversationId, cleanedQuestion)
      if (askRequestRef.current !== requestId || activeConversationRef.current !== conversationId) return
      messageIdRef.current += 1
      setMessages((current) => [...current, {
        id: `assistant-${messageIdRef.current}`,
        role: 'assistant',
        text: result.answer,
        grounded: result.grounded,
        sources: deduplicateSources(result.sources),
      }])
      setConversations((current) => [
        result.conversation,
        ...current.filter((conversation) => conversation.id !== result.conversation.id),
      ])
    } catch (requestError) {
      if (askRequestRef.current !== requestId || activeConversationRef.current !== conversationId) return
      setMessages((current) => current.filter((message) => message.id !== userMessage.id))
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
        setError('This conversation is no longer available. Choose another conversation or start a new chat.')
        loadConversations()
      } else {
        setError(getRagError(requestError, 'Unable to ask the Project Assistant.'))
      }
    } finally {
      if (askRequestRef.current === requestId) {
        setAsking(false)
        askingRef.current = false
      }
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
    if (!expanded && !historyOpen) return undefined
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return
      if (historyOpen) {
        setHistoryOpen(false)
        return
      }
      if (expanded) closeExpanded()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [expanded, historyOpen, closingExpanded])

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

  const renderConversation = (canAsk) => (
    <div className={`assistant-chat${canAsk ? '' : ' history-only'}`}>
      <div className="assistant-message-area" ref={messageAreaRef} aria-live="polite">
        {historyLoading && messages.length === 0 ? (
          <div className="assistant-chat-empty">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Loading conversation...</span>
          </div>
        ) : messages.length === 0 && !asking ? (
          <div className="assistant-chat-empty">
            <strong>Ask a question about the project documents.</strong>
            <span>Answers will be based only on PDFs uploaded to this project.</span>
          </div>
        ) : messages.map((message) => (
          <article className={`assistant-message ${message.role}`} key={message.id}>
            <span className="assistant-message-label">
              {message.role === 'assistant'
                ? 'Project Assistant'
                : message.authorId === currentUser.id ? 'You' : message.authorName || 'Project member'}
            </span>
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
      {canAsk && (
        <form className="assistant-question-form" onSubmit={submitQuestion}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            placeholder="Ask about project documents..."
            maxLength={1000}
            rows={3}
            disabled={asking || historyLoading}
            aria-label="Question for Project Assistant"
          />
          <button className="btn taskflow-button primary" type="submit" disabled={asking || historyLoading || !question.trim()}>
            {asking ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )

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
          <button className="assistant-header-button" type="button" onClick={createConversation} disabled={creatingConversation}>
            <PlusIcon /><span>{creatingConversation ? 'Creating...' : 'New Chat'}</span>
          </button>
          <button ref={historyButtonRef} className={`assistant-header-button${historyOpen ? ' active' : ''}`} type="button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            <HistoryIcon /><span>History</span>
          </button>
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

      <div
        ref={historyPanelRef}
        className={`assistant-history-panel${historyOpen ? ' open' : ''}`}
        aria-hidden={!historyOpen}
        {...(!historyOpen ? { inert: '' } : {})}
      >
          <div className="assistant-history-panel-heading"><strong>Conversations</strong><span>{conversations.length}</span></div>
          {conversations.length === 0 ? (
            <p className="assistant-history-empty">No conversations yet.</p>
          ) : conversations.map((conversation) => {
            const canDelete = currentUser.id === projectOwnerId || currentUser.id === conversation.created_by
            return (
              <div className={`assistant-history-item${conversation.id === activeConversationId ? ' active' : ''}`} key={conversation.id}>
                <button type="button" onClick={() => selectConversation(conversation.id)}>
                  <strong>{conversation.title}</strong>
                  <span>{formatConversationDate(conversation.updated_at)} · {conversation.creator.name}</span>
                </button>
                {canDelete && <button className="assistant-history-delete" type="button" onClick={() => setConversationToDelete(conversation)} aria-label={`Delete ${conversation.title}`}><TrashIcon /></button>}
              </div>
            )
          })}
      </div>

      {error && <div className="assistant-error" role="alert">{error}</div>}
      {historyError && <div className="assistant-error" role="alert">{historyError}</div>}

      <div className="project-assistant-body" key={effectiveStatus}>
        {documentsLoading || effectiveStatus === 'checking' ? (
          <div className="assistant-state"><span className="loading-spinner" aria-hidden="true" /><span>Checking assistant status...</span></div>
        ) : documents.length === 0 ? (
          <div className="assistant-history-stack">
            <div className="assistant-empty-state">
              <strong>No project documents available.</strong>
              <span>Upload a PDF to use the Project Assistant.</span>
            </div>
            {(messages.length > 0 || historyLoading) && renderConversation(false)}
          </div>
        ) : effectiveStatus === 'missing' || effectiveStatus === 'error' ? (
          <div className="assistant-history-stack">
            <div className="assistant-prepare-state">
              <div><strong>The assistant needs to prepare the project documents before questions can be answered.</strong></div>
              <button className="btn taskflow-button primary" type="button" onClick={effectiveStatus === 'error' ? () => checkStatus() : prepareAssistant} disabled={preparing}>
                {effectiveStatus === 'error' ? 'Check Again' : preparing ? 'Preparing...' : 'Prepare Assistant'}
              </button>
            </div>
            {(messages.length > 0 || historyLoading) && renderConversation(false)}
          </div>
        ) : effectiveStatus === 'stale' ? (
          <div className="assistant-history-stack">
            <div className="assistant-prepare-state">
              <div><strong>Project documents have changed.</strong><span>Update the assistant before asking questions.</span></div>
              <button className="btn taskflow-button primary" type="button" onClick={prepareAssistant} disabled={preparing}>
                {preparing ? 'Preparing...' : 'Update Assistant'}
              </button>
            </div>
            {(messages.length > 0 || historyLoading) && renderConversation(false)}
          </div>
        ) : effectiveStatus === 'preparing' ? (
          <div className="assistant-history-stack">
            <div className="assistant-state"><span className="loading-spinner" aria-hidden="true" /><span>Preparing project documents...</span></div>
            {(messages.length > 0 || historyLoading) && renderConversation(false)}
          </div>
        ) : !activeConversationId ? (
          <div className="assistant-conversation-empty">
            <strong>Start a conversation about this project&apos;s documents.</strong>
            <button className="btn taskflow-button primary" type="button" onClick={createConversation} disabled={creatingConversation}>
              <PlusIcon />{creatingConversation ? 'Creating...' : 'New Chat'}
            </button>
          </div>
        ) : (
          renderConversation(true)
        )}
      </div>
      <ConfirmModal
        isOpen={Boolean(conversationToDelete)}
        title="Delete conversation?"
        message={conversationToDelete ? `This will permanently delete “${conversationToDelete.title}” and its messages.` : ''}
        confirmLabel="Delete Conversation"
        loadingLabel="Deleting..."
        fallbackError="Unable to delete conversation."
        onClose={() => setConversationToDelete(null)}
        onConfirm={() => deleteProjectAssistantConversation(projectId, conversationToDelete.id)}
        onConfirmed={() => finishConversationDeletion(conversationToDelete)}
      />
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

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, GitHubIcon } from './AppIcons.jsx'
import {
  connectGitHubRepository,
  getGitHubError,
  getGitHubRepositories,
  startGitHubOAuth,
} from '../services/github.js'

function GitHubRepositoryModal({ isOpen, projectId, onClose, onConnected }) {
  const [repositories, setRepositories] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [needsAuthorization, setNeedsAuthorization] = useState(false)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setRepositories([])
    setQuery('')
    setSelected(null)
    setError('')
    setNeedsAuthorization(false)
    setClosing(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await getGitHubRepositories(projectId, query)
        if (active) {
          setRepositories(data)
          setNeedsAuthorization(false)
        }
      } catch (requestError) {
        if (!active) return
        const authorizationRequired = requestError.response?.status === 409 || requestError.response?.status === 401
        setNeedsAuthorization(authorizationRequired)
        setRepositories([])
        setError(authorizationRequired ? '' : getGitHubError(requestError, 'Unable to load GitHub repositories.'))
      } finally {
        if (active) setLoading(false)
      }
    }, query ? 280 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [isOpen, projectId, query])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !connecting && !authorizing) finishClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  })

  const finishClose = (afterClose, confirmed = false) => {
    if ((!confirmed && (connecting || authorizing)) || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      afterClose?.()
      onClose()
    }, 260)
  }

  if (!isOpen) return null

  const authorize = async () => {
    setAuthorizing(true)
    setError('')
    try {
      const { authorization_url: authorizationUrl } = await startGitHubOAuth(projectId)
      window.location.assign(authorizationUrl)
    } catch (requestError) {
      setError(getGitHubError(requestError, 'Unable to start GitHub authorization.'))
      setAuthorizing(false)
    }
  }

  const connect = async () => {
    if (!selected) return
    setConnecting(true)
    setError('')
    try {
      const project = await connectGitHubRepository(projectId, selected)
      setConnecting(false)
      finishClose(() => onConnected(project), true)
    } catch (requestError) {
      const authorizationRequired = requestError.response?.status === 401
      setNeedsAuthorization(authorizationRequired)
      setError(authorizationRequired ? '' : getGitHubError(requestError, 'Unable to connect this repository.'))
      setConnecting(false)
    }
  }

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal github-repository-modal" role="dialog" aria-modal="true" aria-labelledby="github-modal-title">
        <header className="modal-header-custom">
          <div><h2 id="github-modal-title">Connect GitHub repository</h2><p>Select a repository available to your authorized GitHub account.</p></div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={connecting || authorizing}><CloseIcon /></button>
        </header>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {needsAuthorization ? (
          <div className="github-authorization-state">
            <GitHubIcon />
            <strong>Authorize TaskFlow with GitHub</strong>
            <p>GitHub authorization is required to discover repositories. Access tokens remain encrypted on the backend.</p>
            <button className="btn taskflow-button primary" type="button" onClick={authorize} disabled={authorizing}>{authorizing ? 'Opening GitHub...' : 'Authorize GitHub'}</button>
          </div>
        ) : <>
          <label className="github-repository-search"><span>Search repositories</span><input className="form-control" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owner or repository name" /></label>
          <div className="github-repository-list" aria-live="polite">
            {loading ? <div className="assistant-state"><span className="loading-spinner" aria-hidden="true" /><span>Loading repositories...</span></div> : repositories.length === 0 ? <p className="github-repository-empty">No matching repositories found.</p> : repositories.map((repository) => (
              <button className={selected?.full_name === repository.full_name ? 'selected' : ''} type="button" key={repository.full_name} onClick={() => setSelected(repository)}>
                <span><GitHubIcon /><strong>{repository.full_name}</strong></span>
                <small>{repository.private ? 'Private' : 'Public'} · Default branch: {repository.default_branch}</small>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-light taskflow-button" type="button" onClick={() => finishClose()} disabled={connecting}>Cancel</button>
            <button className="btn taskflow-button primary" type="button" onClick={connect} disabled={!selected || connecting}>{connecting ? 'Connecting...' : 'Connect Repository'}</button>
          </div>
        </>}
      </section>
    </div>,
    document.body,
  )
}

export default GitHubRepositoryModal

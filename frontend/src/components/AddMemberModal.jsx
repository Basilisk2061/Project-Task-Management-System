import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './AppIcons.jsx'
import { UserIcon } from './FormIcons.jsx'
import { addProjectMember, getProjectError, searchUsers } from '../services/projects.js'
import { PROFESSIONAL_ROLE_FALLBACK } from '../constants/options.js'
import { SkeletonRows } from './Skeleton.jsx'
import { useToast } from './ToastProvider.jsx'

function AddMemberModal({ isOpen, projectId, onClose, onMemberAdded }) {
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [addingUserId, setAddingUserId] = useState(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setResults([])
    setSearching(true)
    setAddingUserId(null)
    setError('')
    setClosing(false)
  }, [isOpen])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const trimmedQuery = query.trim()

    let active = true
    setSearching(true)
    setError('')
    const timer = window.setTimeout(() => {
      searchUsers(projectId, trimmedQuery)
        .then((data) => { if (active) setResults(data) })
        .catch((requestError) => {
          if (active) setError(getProjectError(requestError, 'Unable to search users.'))
        })
        .finally(() => { if (active) setSearching(false) })
    }, trimmedQuery ? 300 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isOpen, projectId, query])

  const finishClose = () => {
    if (addingUserId || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 260)
  }

  if (!isOpen) return null

  const addMember = async (userId) => {
    setAddingUserId(userId)
    setError('')
    try {
      const member = await addProjectMember(projectId, userId)
      setResults((current) => current.filter((user) => user.id !== userId))
      onMemberAdded(member)
    } catch (requestError) {
      const message = getProjectError(requestError, 'Unable to add project member.')
      setError(message)
      showToast(message, { type: 'error' })
    } finally {
      setAddingUserId(null)
    }
  }

  return createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal member-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
        <header className="modal-header-custom">
          <div><h2 id="member-modal-title">Add Project Member</h2><p>Search for an existing TaskFlow user.</p></div>
          <button type="button" onClick={finishClose} aria-label="Close modal" disabled={Boolean(addingUserId)}><CloseIcon /></button>
        </header>

        <label className="form-label" htmlFor="member-search">Search by name or email</label>
        <div className="member-search-field">
          <span aria-hidden="true"><UserIcon /></span>
          <input className="form-control" id="member-search" value={query}
            onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." autoFocus />
        </div>

        {error && <div className="alert alert-danger py-2 mt-3" role="alert">{error}</div>}

        <p className="member-results-label">People</p>
        <div className="member-search-results" aria-live="polite">
          {searching ? (
            <SkeletonRows count={3} variant="members" />
          ) : results.length === 0 ? (
            <p className="member-search-message">No users found.</p>
          ) : results.map((user) => (
            <div className="member-search-result" key={user.id}>
              <div><strong>{user.name}</strong><span className="member-search-professional-role">{user.professional_role || PROFESSIONAL_ROLE_FALLBACK}</span><span>{user.email}</span></div>
              <button className="btn taskflow-button secondary" type="button"
                onClick={() => addMember(user.id)} disabled={addingUserId !== null}>
                {addingUserId === user.id ? 'Adding...' : 'Add'}
              </button>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-light taskflow-button" type="button" onClick={finishClose} disabled={Boolean(addingUserId)}>Cancel</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default AddMemberModal

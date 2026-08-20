import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, TrashIcon } from './AppIcons.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import GitHubCommitList from './GitHubCommitList.jsx'
import { SkeletonRows } from './Skeleton.jsx'
import { createComment, deleteComment, getCommentError, getTaskComments } from '../services/comments.js'
import { formatCommentTimestamp, formatDate } from '../utils/date.js'
import { getGitHubError, getTaskGitHubCommits } from '../services/github.js'

const statusLabels = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Completed',
}

function TaskDetailsModal({ isOpen, task, user, onClose, onEdit, readOnly = false }) {
  const [comments, setComments] = useState([])
  const [content, setContent] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [commentToDelete, setCommentToDelete] = useState(null)
  const [removingCommentId, setRemovingCommentId] = useState(null)
  const [githubCommits, setGitHubCommits] = useState([])
  const [githubLoading, setGitHubLoading] = useState(false)
  const [githubError, setGitHubError] = useState('')
  const [githubRevision, setGitHubRevision] = useState(0)
  const closeTimer = useRef(null)
  const removeTimer = useRef(null)

  useEffect(() => {
    if (!isOpen || !task) return undefined
    let active = true
    setComments([])
    setContent('')
    setError('')
    setClosing(false)
    setCommentToDelete(null)
    setRemovingCommentId(null)
    setLoadingComments(true)
    getTaskComments(task.id)
      .then((data) => { if (active) setComments(data) })
      .catch((requestError) => { if (active) setError(getCommentError(requestError, 'Unable to load comments.')) })
      .finally(() => { if (active) setLoadingComments(false) })
    return () => { active = false }
  }, [isOpen, task])

  useEffect(() => {
    const githubConnected = Boolean(task?.project.github_repo_owner && task?.project.github_repo_name)
    if (!isOpen || !task || !githubConnected) {
      setGitHubCommits([])
      setGitHubError('')
      return undefined
    }
    let active = true
    setGitHubLoading(true)
    setGitHubError('')
    setGitHubCommits([])
    getTaskGitHubCommits(task.project.id, task.id)
      .then((data) => { if (active) setGitHubCommits(data) })
      .catch((requestError) => {
        if (active) setGitHubError(getGitHubError(requestError, 'Unable to load task GitHub activity.'))
      })
      .finally(() => { if (active) setGitHubLoading(false) })
    return () => { active = false }
  }, [isOpen, task, githubRevision])

  useEffect(() => () => {
    window.clearTimeout(closeTimer.current)
    window.clearTimeout(removeTimer.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  const finishClose = (afterClose) => {
    if (posting || closing || commentToDelete) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      onClose()
      afterClose?.()
    }, 260)
  }

  useEffect(() => {
    if (!isOpen || commentToDelete) return undefined
    const handleEscape = (event) => {
      if (event.key === 'Escape') finishClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  })

  if (!isOpen || !task) return null

  const taskReadOnly = readOnly || task.project.status === 'completed'
  const githubConnected = Boolean(task.project.github_repo_owner && task.project.github_repo_name)
  const canEdit = !taskReadOnly && Boolean(onEdit) && (task.project.created_by === user.id || task.created_by === user.id)

  const postComment = async (event) => {
    event.preventDefault()
    const cleanedContent = content.trim()
    if (!cleanedContent) {
      setError('Comment cannot be empty.')
      return
    }

    setPosting(true)
    setError('')
    try {
      const created = await createComment(task.id, cleanedContent)
      setComments((current) => [...current, created])
      setContent('')
    } catch (requestError) {
      setError(getCommentError(requestError, 'Unable to post comment.'))
    } finally {
      setPosting(false)
    }
  }

  const finishCommentRemoval = (comment) => {
    setRemovingCommentId(comment.id)
    removeTimer.current = window.setTimeout(() => {
      setComments((current) => current.filter((item) => item.id !== comment.id))
      setRemovingCommentId(null)
    }, 200)
  }

  const modal = createPortal(
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) finishClose()
    }}>
      <section className="taskflow-modal task-details-modal" role="dialog" aria-modal="true" aria-labelledby="task-details-modal-title">
        <header className="modal-header-custom task-details-header">
          <div><h2 id="task-details-modal-title">Task Details</h2><p>{task.project.name}</p></div>
          <button type="button" onClick={() => finishClose()} aria-label="Close modal" disabled={posting}><CloseIcon /></button>
        </header>

        <div className="task-details-body">
          <div className="task-details-title-row">
            <div><h3>{task.title}</h3><p>{task.description || 'No description provided.'}</p></div>
            {canEdit && <button className="task-details-edit" type="button" onClick={() => finishClose(() => onEdit(task))}>Edit Task</button>}
          </div>

          <dl className="task-details-grid">
            <div><dt>Status</dt><dd>{statusLabels[task.status] || task.status}</dd></div>
            <div><dt>Priority</dt><dd className={`task-details-priority ${task.priority}`}>{task.priority}</dd></div>
            <div><dt>Assigned to</dt><dd>{task.assignee?.name || 'Unassigned'}</dd></div>
            <div><dt>Created by</dt><dd>{task.creator?.name || 'Creator unavailable'}</dd></div>
            <div><dt>Due date</dt><dd>{task.due_date ? formatDate(task.due_date) : 'No due date'}</dd></div>
            <div><dt>Commit reference</dt><dd><code>TASK-{task.id}</code></dd></div>
          </dl>

          {githubConnected && <section className="task-github-activity" aria-labelledby="task-github-activity-title">
            <div className="task-github-heading"><h3 id="task-github-activity-title">GitHub Activity</h3><button type="button" onClick={() => setGitHubRevision((current) => current + 1)} disabled={githubLoading}>Refresh</button></div>
            {githubError && <div className="github-activity-error" role="alert">{githubError}</div>}
            {githubLoading ? <SkeletonRows count={2} variant="commits" /> : <GitHubCommitList commits={githubCommits} emptyMessage="No GitHub commits reference this task yet." />}
          </section>}

          <section className="task-comments" aria-labelledby="task-comments-title">
            <h3 id="task-comments-title">Comments</h3>
            {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

            {loadingComments ? (
              <SkeletonRows count={2} variant="comments" />
            ) : comments.length === 0 ? (
              <p className="comments-empty">No comments yet.</p>
            ) : (
              <div className="comment-list">
                {comments.map((comment) => {
                  const canDelete = !taskReadOnly && (comment.author.id === user.id || task.project.created_by === user.id)
                  return (
                    <article className={`task-comment${removingCommentId === comment.id ? ' removing' : ''}`} key={comment.id}>
                      <header>
                        <div><strong>{comment.author.name}</strong><time dateTime={comment.created_at}>{formatCommentTimestamp(comment.created_at)}</time></div>
                        {canDelete && (
                          <button type="button" onClick={() => setCommentToDelete(comment)} aria-label={`Delete comment by ${comment.author.name}`} title="Delete comment">
                            <TrashIcon />
                          </button>
                        )}
                      </header>
                      <p>{comment.content}</p>
                    </article>
                  )
                })}
              </div>
            )}

            {taskReadOnly ? (
              <p className="completed-read-only-note">Comments are read-only because this project is completed.</p>
            ) : <form className="comment-form" onSubmit={postComment}>
              <label className="form-label" htmlFor="task-comment-content">Add a comment</label>
              <textarea className="form-control" id="task-comment-content" rows="3" maxLength="2000" placeholder="Write a comment..." value={content} onChange={(event) => setContent(event.target.value)} disabled={posting} />
              <div><span>{content.length}/2000</span><button className="btn taskflow-button primary" type="submit" disabled={posting || loadingComments}>{posting && <span className="button-spinner" aria-hidden="true" />}{posting ? 'Posting...' : 'Post Comment'}</button></div>
            </form>}
          </section>
        </div>
      </section>
    </div>,
    document.body,
  )

  return <>
    {modal}
    <ConfirmModal
      isOpen={Boolean(commentToDelete)}
      title="Delete comment?"
      message="This comment will be permanently removed."
      confirmLabel="Delete Comment"
      loadingLabel="Deleting..."
      fallbackError="Unable to delete comment."
      onClose={() => setCommentToDelete(null)}
      onConfirm={() => deleteComment(commentToDelete.id)}
      onConfirmed={() => finishCommentRemoval(commentToDelete)}
    />
  </>
}

export default TaskDetailsModal

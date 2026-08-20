import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EditIcon, FileIcon, PlusIcon, TrashIcon } from '../components/AppIcons.jsx'
import AddMemberModal from '../components/AddMemberModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import DocumentUploadModal from '../components/DocumentUploadModal.jsx'
import ProjectFormModal from '../components/ProjectFormModal.jsx'
import ProjectAssistant from '../components/ProjectAssistant.jsx'
import { PROFESSIONAL_ROLE_FALLBACK } from '../constants/options.js'
import TaskBoard from '../components/TaskBoard.jsx'
import TaskDetailsModal from '../components/TaskDetailsModal.jsx'
import TaskFormModal from '../components/TaskFormModal.jsx'
import {
  deleteProject,
  getProject,
  getProjectError,
  getProjectMembers,
  removeProjectMember,
  updateProject,
} from '../services/projects.js'
import { formatCreatedDate, formatDate } from '../utils/date.js'
import { deleteDocument, getDocumentBlob, getDocumentError, getProjectDocuments } from '../services/documents.js'
import { createTask, deleteTask, getProjectTasks, getTaskError, updateTask, updateTaskStatus } from '../services/tasks.js'

function ProjectDetails() {
  const { projectId } = useParams()
  const { user } = useOutletContext()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState(null)
  const [removingUserId, setRemovingUserId] = useState(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskToDelete, setTaskToDelete] = useState(null)
  const [detailsTask, setDetailsTask] = useState(null)
  const [savingStatusId, setSavingStatusId] = useState(null)
  const [taskError, setTaskError] = useState('')
  const [displayProgress, setDisplayProgress] = useState(0)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentError, setDocumentError] = useState('')
  const [documentUploadOpen, setDocumentUploadOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState(null)
  const [removingDocumentId, setRemovingDocumentId] = useState(null)
  const [documentAction, setDocumentAction] = useState('')
  const [assistantDocumentRevision, setAssistantDocumentRevision] = useState(0)
  const removeTimer = useRef(null)
  const documentTimer = useRef(null)
  const completedTaskCount = tasks.filter((task) => task.status === 'completed').length
  const taskCount = tasks.length
  const progressPercent = taskCount === 0 ? 0 : Math.round((completedTaskCount / taskCount) * 100)

  useEffect(() => {
    let active = true
    Promise.all([getProject(projectId), getProjectMembers(projectId), getProjectTasks(projectId)])
      .then(([projectData, memberData, taskData]) => {
        if (active) {
          setProject(projectData)
          setMembers(memberData)
          setTasks(taskData)
        }
      })
      .catch((requestError) => { if (active) setError(getProjectError(requestError, 'Project not found.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  useEffect(() => {
    let active = true
    setDocumentsLoading(true)
    setDocumentError('')
    getProjectDocuments(projectId)
      .then((data) => { if (active) setDocuments(data) })
      .catch(async (requestError) => {
        const message = await getDocumentError(requestError, 'Unable to load documents.')
        if (active) setDocumentError(message)
      })
      .finally(() => { if (active) setDocumentsLoading(false) })
    return () => { active = false }
  }, [projectId])

  useEffect(() => () => {
    window.clearTimeout(removeTimer.current)
    window.clearTimeout(documentTimer.current)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDisplayProgress(progressPercent))
    return () => window.cancelAnimationFrame(frame)
  }, [progressPercent])

  if (loading) return <div className="content-loading"><span className="loading-spinner" aria-hidden="true" /><span>Loading project...</span></div>

  if (error || !project) {
    return <section className="project-error-state"><h2>Project unavailable</h2><p>{error || 'Project not found.'}</p><Link to="/app/projects">Back to Projects</Link></section>
  }

  const isOwner = project.created_by === user.id

  const finishMemberRemoval = (member) => {
    setRemovingUserId(member.user_id)
    removeTimer.current = window.setTimeout(() => {
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id))
      setTasks((current) => current.map((task) => task.assigned_to === member.user_id ? { ...task, assigned_to: null, assignee: null } : task))
      setRemovingUserId(null)
      setMemberToRemove(null)
    }, 220)
  }

  const changeTaskStatus = async (task, statusValue) => {
    setSavingStatusId(task.id)
    setTaskError('')
    try {
      const updated = await updateTaskStatus(task.id, statusValue)
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (requestError) {
      setTaskError(getTaskError(requestError, 'Unable to update task status.'))
    } finally {
      setSavingStatusId(null)
    }
  }

  const openDocument = async (document) => {
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      setDocumentError('Unable to open PDF. Allow pop-ups for TaskFlow and try again.')
      return
    }
    previewWindow.opener = null
    setDocumentAction(`open-${document.id}`)
    setDocumentError('')
    try {
      const blob = await getDocumentBlob(document.id)
      const objectUrl = URL.createObjectURL(blob)
      previewWindow.location.href = objectUrl
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (requestError) {
      previewWindow.close()
      setDocumentError(await getDocumentError(requestError, 'Unable to open PDF.'))
    } finally {
      setDocumentAction('')
    }
  }

  const downloadDocumentFile = async (document) => {
    setDocumentAction(`download-${document.id}`)
    setDocumentError('')
    try {
      const blob = await getDocumentBlob(document.id)
      const objectUrl = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = objectUrl
      link.download = document.file_name
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch (requestError) {
      setDocumentError(await getDocumentError(requestError, 'Unable to download PDF.'))
    } finally {
      setDocumentAction('')
    }
  }

  const finishDocumentRemoval = (document) => {
    setAssistantDocumentRevision((current) => current + 1)
    setRemovingDocumentId(document.id)
    documentTimer.current = window.setTimeout(() => {
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      setRemovingDocumentId(null)
      setDocumentToDelete(null)
    }, 200)
  }

  return (
    <div className="project-details-page">
      <Link className="back-link" to="/app/projects">← Back to Projects</Link>
      <div className="project-details-layout">
        <div className="project-details-main">
      <section className="project-details-card">
        <div className="project-details-heading">
          <div><h2>{project.name}</h2><p>{project.description || 'No description provided.'}</p></div>
          {isOwner && <div className="project-actions">
            <button className="btn taskflow-button secondary" type="button" onClick={() => setEditOpen(true)}><EditIcon /><span>Edit Project</span></button>
            <button className="btn taskflow-button danger-outline" type="button" onClick={() => setDeleteOpen(true)}><TrashIcon /><span>Delete Project</span></button>
          </div>}
        </div>
        <dl className="project-details-list">
          <div><dt>Start Date</dt><dd>{formatDate(project.start_date)}</dd></div>
          <div><dt>Deadline</dt><dd>{formatDate(project.deadline)}</dd></div>
          <div><dt>Created Date</dt><dd>{formatCreatedDate(project.created_at)}</dd></div>
        </dl>
      </section>

      <section className="project-progress-card" aria-labelledby="project-progress-title">
        <div className="project-progress-heading">
          <div>
            <h2 id="project-progress-title">Project progress</h2>
            <p>{completedTaskCount} of {taskCount} tasks completed</p>
          </div>
          <strong>{progressPercent}%</strong>
        </div>
        <div className="project-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
          <span style={{ width: `${displayProgress}%` }} />
        </div>
      </section>

      <section className="members-card">
        <header className="members-header">
          <div><h2>Members</h2><p>People with access to this project.</p></div>
          {isOwner && <button className="btn taskflow-button primary" type="button" onClick={() => setAddMemberOpen(true)}><PlusIcon /><span>Add Member</span></button>}
        </header>
        <div className="members-list">
          {members.map((member, index) => (
            <div className={`member-row${removingUserId === member.user_id ? ' removing' : ''}`}
              key={member.user_id} style={{ '--member-delay': `${Math.min(index, 6) * 35}ms` }}>
              <div className="member-identity"><strong>{member.name}</strong><span className="member-professional-role">{member.professional_role || PROFESSIONAL_ROLE_FALLBACK}</span><span>{member.email}</span></div>
              <span className="member-role">{member.role}</span>
              {isOwner && member.role === 'Member' ? (
                <button className="member-remove-button" type="button" onClick={() => setMemberToRemove(member)}>Remove</button>
              ) : <span className="member-action-space" />}
            </div>
          ))}
        </div>
      </section>

      <section className="tasks-section">
        <header className="tasks-header">
          <div><h2>Tasks</h2><p>Track work across each project status.</p></div>
          <button className="btn taskflow-button primary" type="button" onClick={() => { setSelectedTask(null); setTaskModalOpen(true) }}><PlusIcon /><span>New Task</span></button>
        </header>
        {taskError && <div className="alert alert-danger mx-3 mt-3" role="alert">{taskError}</div>}
        <TaskBoard tasks={tasks} user={user} savingStatusId={savingStatusId}
          onStatusChange={changeTaskStatus}
          onView={setDetailsTask}
          onEdit={(task) => { setSelectedTask(task); setTaskModalOpen(true) }}
          onDelete={setTaskToDelete} />
      </section>

      <section className="documents-card">
        <header className="documents-header">
          <div><h2>Documents</h2><p>Project PDFs shared with the team.</p></div>
          <button className="btn taskflow-button primary" type="button" onClick={() => setDocumentUploadOpen(true)}><PlusIcon /><span>Upload PDF</span></button>
        </header>
        {documentError && <div className="alert alert-danger mx-3 mt-3" role="alert">{documentError}</div>}
        {documentsLoading ? (
          <div className="documents-loading"><span className="loading-spinner" aria-hidden="true" /><span>Loading documents...</span></div>
        ) : documents.length === 0 ? (
          <div className="documents-empty"><strong>No documents uploaded yet.</strong><span>Upload project PDFs to keep important information in one place.</span></div>
        ) : (
          <div className="documents-list">
            {documents.map((document, index) => {
              const canDeleteDocument = isOwner || document.uploaded_by === user.id
              const opening = documentAction === `open-${document.id}`
              const downloading = documentAction === `download-${document.id}`
              return (
                <article className={`document-row${removingDocumentId === document.id ? ' removing' : ''}`} key={document.id} style={{ '--document-delay': `${Math.min(index, 6) * 35}ms` }}>
                  <div className="document-identity"><span className="document-icon"><FileIcon /></span><div><strong>{document.file_name}</strong><span className="document-type-badge">{document.document_type || 'Other'}</span><span>Uploaded by {document.uploader.name} · {formatCreatedDate(document.created_at)}</span></div></div>
                  <div className="document-actions">
                    <button type="button" onClick={() => openDocument(document)} disabled={Boolean(documentAction)}>{opening ? 'Opening...' : 'Open'}</button>
                    <button type="button" onClick={() => downloadDocumentFile(document)} disabled={Boolean(documentAction)}>{downloading ? 'Downloading...' : 'Download'}</button>
                    {canDeleteDocument && <button className="danger" type="button" onClick={() => setDocumentToDelete(document)} disabled={Boolean(documentAction)}>Delete</button>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

        </div>
        <aside className="project-assistant-column">
          <ProjectAssistant
            projectId={project.id}
            projectName={project.name}
            documents={documents}
            documentsLoading={documentsLoading}
            documentRevision={assistantDocumentRevision}
            onOpenDocument={openDocument}
          />
        </aside>
      </div>

      <ProjectFormModal isOpen={editOpen} mode="edit" project={project}
        onClose={() => setEditOpen(false)} onSubmit={(data) => updateProject(project.id, data)} onSaved={setProject} />
      <ConfirmModal isOpen={deleteOpen} projectName={project.name}
        onClose={() => setDeleteOpen(false)} onConfirm={() => deleteProject(project.id)}
        onConfirmed={() => navigate('/app/projects', { replace: true })} />
      <AddMemberModal isOpen={addMemberOpen} projectId={project.id}
        onClose={() => setAddMemberOpen(false)}
        onMemberAdded={(member) => setMembers((current) => [...current, member])} />
      <ConfirmModal isOpen={Boolean(memberToRemove)}
        title="Remove member?"
        message={memberToRemove ? `Remove ${memberToRemove.name} from this project?` : ''}
        confirmLabel="Remove Member"
        loadingLabel="Removing..."
        fallbackError="Unable to remove project member."
        onClose={() => setMemberToRemove(null)}
        onConfirm={() => removeProjectMember(project.id, memberToRemove.user_id)}
        onConfirmed={() => finishMemberRemoval(memberToRemove)} />
      <TaskFormModal isOpen={taskModalOpen} mode={selectedTask ? 'edit' : 'create'}
        task={selectedTask} members={members} onClose={() => { setTaskModalOpen(false); setSelectedTask(null) }}
        onSubmit={(data) => selectedTask ? updateTask(selectedTask.id, data) : createTask(project.id, data)}
        onSaved={(saved) => setTasks((current) => selectedTask ? current.map((task) => task.id === saved.id ? saved : task) : [saved, ...current])} />
      <TaskDetailsModal isOpen={Boolean(detailsTask)} task={detailsTask} user={user}
        onClose={() => setDetailsTask(null)}
        onEdit={(task) => { setSelectedTask(task); setTaskModalOpen(true) }} />
      <DocumentUploadModal isOpen={documentUploadOpen} projectId={project.id}
        onClose={() => setDocumentUploadOpen(false)}
        onSaved={(savedDocument) => {
          setDocuments((current) => [savedDocument, ...current])
          setAssistantDocumentRevision((current) => current + 1)
        }} />
      <ConfirmModal isOpen={Boolean(documentToDelete)} title="Delete document?"
        message={documentToDelete ? `This will permanently delete “${documentToDelete.file_name}”.` : ''}
        confirmLabel="Delete Document" loadingLabel="Deleting..." fallbackError="Unable to delete document."
        onClose={() => setDocumentToDelete(null)} onConfirm={() => deleteDocument(documentToDelete.id)}
        onConfirmed={() => finishDocumentRemoval(documentToDelete)} />
      <ConfirmModal isOpen={Boolean(taskToDelete)} title="Delete task?"
        message={taskToDelete ? `This will permanently delete “${taskToDelete.title}”.` : ''}
        confirmLabel="Delete Task" loadingLabel="Deleting..." fallbackError="Unable to delete task."
        onClose={() => setTaskToDelete(null)} onConfirm={() => deleteTask(taskToDelete.id)}
        onConfirmed={() => { setTasks((current) => current.filter((task) => task.id !== taskToDelete.id)); setTaskToDelete(null) }} />
    </div>
  )
}

export default ProjectDetails

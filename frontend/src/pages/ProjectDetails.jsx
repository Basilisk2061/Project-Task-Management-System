import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EditIcon, PlusIcon, TrashIcon } from '../components/AppIcons.jsx'
import AddMemberModal from '../components/AddMemberModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import ProjectFormModal from '../components/ProjectFormModal.jsx'
import {
  deleteProject,
  getProject,
  getProjectError,
  getProjectMembers,
  removeProjectMember,
  updateProject,
} from '../services/projects.js'
import { formatCreatedDate, formatDate } from '../utils/date.js'

function ProjectDetails() {
  const { projectId } = useParams()
  const { user } = useOutletContext()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState(null)
  const [removingUserId, setRemovingUserId] = useState(null)
  const removeTimer = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([getProject(projectId), getProjectMembers(projectId)])
      .then(([projectData, memberData]) => {
        if (active) {
          setProject(projectData)
          setMembers(memberData)
        }
      })
      .catch((requestError) => { if (active) setError(getProjectError(requestError, 'Project not found.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  useEffect(() => () => window.clearTimeout(removeTimer.current), [])

  if (loading) return <div className="content-loading"><span className="loading-spinner" aria-hidden="true" /><span>Loading project...</span></div>

  if (error || !project) {
    return <section className="project-error-state"><h2>Project unavailable</h2><p>{error || 'Project not found.'}</p><Link to="/app/projects">Back to Projects</Link></section>
  }

  const isOwner = project.created_by === user.id

  const finishMemberRemoval = (member) => {
    setRemovingUserId(member.user_id)
    removeTimer.current = window.setTimeout(() => {
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id))
      setRemovingUserId(null)
      setMemberToRemove(null)
    }, 220)
  }

  return (
    <div className="project-details-page">
      <Link className="back-link" to="/app/projects">← Back to Projects</Link>
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

      <section className="members-card">
        <header className="members-header">
          <div><h2>Members</h2><p>People with access to this project.</p></div>
          {isOwner && <button className="btn taskflow-button primary" type="button" onClick={() => setAddMemberOpen(true)}><PlusIcon /><span>Add Member</span></button>}
        </header>
        <div className="members-list">
          {members.map((member, index) => (
            <div className={`member-row${removingUserId === member.user_id ? ' removing' : ''}`}
              key={member.user_id} style={{ '--member-delay': `${Math.min(index, 6) * 35}ms` }}>
              <div className="member-identity"><strong>{member.name}</strong><span>{member.email}</span></div>
              <span className="member-role">{member.role}</span>
              {isOwner && member.role === 'Member' ? (
                <button className="member-remove-button" type="button" onClick={() => setMemberToRemove(member)}>Remove</button>
              ) : <span className="member-action-space" />}
            </div>
          ))}
        </div>
      </section>

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
    </div>
  )
}

export default ProjectDetails

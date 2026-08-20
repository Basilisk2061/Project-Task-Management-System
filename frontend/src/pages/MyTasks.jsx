import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import TaskBoard from '../components/TaskBoard.jsx'
import TaskDetailsModal from '../components/TaskDetailsModal.jsx'
import { TaskBoardSkeleton } from '../components/Skeleton.jsx'
import { useToast } from '../components/ToastProvider.jsx'
import { getMyTasks, getTaskError, updateTaskStatus } from '../services/tasks.js'

function MyTasks() {
  const { user } = useOutletContext()
  const { showToast } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingStatusId, setSavingStatusId] = useState(null)
  const [detailsTask, setDetailsTask] = useState(null)
  const [taskMotion, setTaskMotion] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const motionTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(motionTimer.current), [])

  const projectOptions = useMemo(() => Array.from(
    new Map(tasks.map((task) => [task.project.id, task.project])).values(),
  ).sort((first, second) => first.name.localeCompare(second.name)), [tasks])

  const visibleTasks = selectedProjectId === 'all'
    ? tasks
    : tasks.filter((task) => task.project.id === Number(selectedProjectId))

  useEffect(() => {
    let active = true
    getMyTasks().then((data) => { if (active) setTasks(data) })
      .catch((requestError) => { if (active) setError(getTaskError(requestError, 'Unable to load your tasks.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const changeStatus = async (task, status) => {
    setSavingStatusId(task.id)
    setError('')
    try {
      const updated = await updateTaskStatus(task.id, status)
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      setTaskMotion({ id: updated.id, completed: status === 'completed' && task.status !== 'completed' })
      window.clearTimeout(motionTimer.current)
      motionTimer.current = window.setTimeout(() => setTaskMotion(null), 380)
      const statusLabel = status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'To Do'
      showToast(status === 'completed' && task.status !== 'completed' ? 'Task completed.' : `Task moved to ${statusLabel}.`)
    } catch (requestError) {
      const message = getTaskError(requestError, 'Unable to update task status.')
      setError(message)
      showToast(message, { type: 'error' })
    } finally {
      setSavingStatusId(null)
    }
  }

  if (loading) return <TaskBoardSkeleton />

  return (
    <div className="my-tasks-page">
      <div className="my-tasks-toolbar">
        <p className="page-subtitle">Tasks currently assigned to you.</p>
        <label className="my-tasks-project-filter">
          <span>Project</span>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value="all">All Projects</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="my-tasks-filtered-board" key={selectedProjectId}>
        <TaskBoard tasks={visibleTasks} user={user} savingStatusId={savingStatusId} onStatusChange={changeStatus} onView={setDetailsTask} showProject taskMotion={taskMotion} />
      </div>
      <TaskDetailsModal isOpen={Boolean(detailsTask)} task={detailsTask} user={user} readOnly={detailsTask?.project.status === 'completed'} onClose={() => setDetailsTask(null)} />
    </div>
  )
}

export default MyTasks

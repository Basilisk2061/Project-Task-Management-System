import { useEffect, useRef, useState } from 'react'
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
  const motionTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(motionTimer.current), [])

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
      <p className="page-subtitle">Tasks currently assigned to you.</p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <TaskBoard tasks={tasks} user={user} savingStatusId={savingStatusId} onStatusChange={changeStatus} onView={setDetailsTask} showProject taskMotion={taskMotion} />
      <TaskDetailsModal isOpen={Boolean(detailsTask)} task={detailsTask} user={user} onClose={() => setDetailsTask(null)} />
    </div>
  )
}

export default MyTasks

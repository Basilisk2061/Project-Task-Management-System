import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import TaskBoard from '../components/TaskBoard.jsx'
import { getMyTasks, getTaskError, updateTaskStatus } from '../services/tasks.js'

function MyTasks() {
  const { user } = useOutletContext()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingStatusId, setSavingStatusId] = useState(null)

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
    } catch (requestError) {
      setError(getTaskError(requestError, 'Unable to update task status.'))
    } finally {
      setSavingStatusId(null)
    }
  }

  if (loading) return <div className="content-loading"><span className="loading-spinner" aria-hidden="true" /><span>Loading your tasks...</span></div>

  return (
    <div className="my-tasks-page">
      <p className="page-subtitle">Tasks currently assigned to you.</p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <TaskBoard tasks={tasks} user={user} savingStatusId={savingStatusId} onStatusChange={changeStatus} showProject />
    </div>
  )
}

export default MyTasks

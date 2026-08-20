import { useRef, useState } from 'react'
import { DragHandleIcon } from './AppIcons.jsx'
import { formatTaskDueDate } from '../utils/date.js'

const columns = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
]

function getLocalDateValue() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function TaskBoard({ tasks, user, onEdit, onDelete, onStatusChange, onView, savingStatusId, showProject = false, taskMotion = null }) {
  const today = getLocalDateValue()
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const dragPreviewRef = useRef(null)
  const draggedTask = tasks.find((task) => task.id === draggedTaskId)

  const beginDrag = (event, task) => {
    const card = event.currentTarget.closest('.task-card')
    if (card) {
      const cardBounds = card.getBoundingClientRect()
      const preview = card.cloneNode(true)
      preview.querySelector('.task-drag-handle')?.remove()
      preview.querySelector('.task-status-select')?.remove()
      preview.querySelector('.task-card-actions')?.remove()
      preview.classList.remove('dragging')
      preview.classList.add('task-drag-preview')
      preview.style.width = `${cardBounds.width}px`
      preview.style.setProperty('--task-delay', '0ms')
      document.body.appendChild(preview)
      dragPreviewRef.current = preview

      const offsetX = Math.max(0, Math.min(event.clientX - cardBounds.left, cardBounds.width))
      const offsetY = Math.max(0, Math.min(event.clientY - cardBounds.top, cardBounds.height))
      event.dataTransfer.setDragImage(preview, offsetX, offsetY)

      window.setTimeout(() => {
        preview.remove()
        if (dragPreviewRef.current === preview) dragPreviewRef.current = null
      }, 0)
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(task.id))
    setDraggedTaskId(task.id)
  }

  const finishDrag = () => {
    dragPreviewRef.current?.remove()
    dragPreviewRef.current = null
    setDraggedTaskId(null)
    setDragOverStatus(null)
  }

  const allowDrop = (event, status) => {
    if (!draggedTask) return
    event.preventDefault()
    event.dataTransfer.dropEffect = draggedTask.status === status ? 'none' : 'move'
    setDragOverStatus(draggedTask.status === status ? null : status)
  }

  const dropTask = (event, status) => {
    event.preventDefault()
    const task = draggedTask
    finishDrag()
    if (!task || task.status === status) return
    onStatusChange(task, status)
  }

  return (
    <div className="task-board">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status)
        return (
          <section
            className={`task-column${dragOverStatus === column.status ? ' drop-target' : ''}`}
            key={column.status}
            onDragOver={(event) => allowDrop(event, column.status)}
            onDrop={(event) => dropTask(event, column.status)}
          >
            <header><h3>{column.label}</h3><span>{columnTasks.length}</span></header>
            <div className="task-column-content">
              {dragOverStatus === column.status && <div className="task-drop-placeholder" aria-hidden="true">Drop task here</div>}
              {columnTasks.length === 0 ? (dragOverStatus === column.status ? null : <p className="task-column-empty">No tasks</p>) : columnTasks.map((task, index) => {
                const isOwner = task.project.created_by === user.id
                const canEdit = isOwner || task.created_by === user.id
                const canStatus = isOwner || task.created_by === user.id || task.assigned_to === user.id
                const incomplete = task.status !== 'completed'
                const overdue = Boolean(task.due_date && task.due_date < today && incomplete)
                const dueToday = Boolean(task.due_date && task.due_date === today && incomplete)
                const dueLabel = formatTaskDueDate(task.due_date)
                return (
                  <article
                    className={`task-card${onView ? ' viewable' : ''}${draggedTaskId === task.id ? ' dragging' : ''}${taskMotion?.id === task.id ? ' just-moved' : ''}${taskMotion?.id === task.id && taskMotion.completed ? ' just-completed' : ''}`}
                    key={task.id}
                    style={{ '--task-delay': `${Math.min(index, 6) * 35}ms` }}
                    onClick={() => onView?.(task)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        onView?.(task)
                      }
                    }}
                    tabIndex={onView ? 0 : undefined}
                    aria-label={onView ? `View details for ${task.title}` : undefined}
                  >
                    <div className="task-card-heading">
                      <h4>{task.title}</h4>
                      <div className="task-card-heading-actions">
                        <span className={`priority-label ${task.priority}`}>{task.priority}</span>
                        {canStatus && (
                          <span
                            className="task-drag-handle"
                            draggable={savingStatusId !== task.id}
                            onDragStart={(event) => beginDrag(event, task)}
                            onDragEnd={finishDrag}
                            onClick={(event) => event.stopPropagation()}
                            role="button"
                            aria-label={`Drag ${task.title} to another status`}
                            title="Drag to change status"
                          >
                            <DragHandleIcon />
                          </span>
                        )}
                      </div>
                    </div>
                    {showProject && <p className="task-project-name">{task.project.name}</p>}
                    <div className="task-meta">
                      <span>{task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'}</span>
                      <span>{task.creator ? `Created by ${task.creator.name}` : 'Creator unavailable'}</span>
                      <span className={overdue ? 'overdue' : dueToday ? 'due-today' : ''}>{dueLabel}</span>
                    </div>
                    {canStatus && <select className="task-status-select" value={task.status} disabled={savingStatusId === task.id} onClick={(event) => event.stopPropagation()} onChange={(event) => onStatusChange(task, event.target.value)} aria-label={`Status for ${task.title}`}><option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select>}
                    {(canEdit && onEdit) && <div className="task-card-actions" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => onEdit(task)}>Edit</button><button className="danger" type="button" onClick={() => onDelete(task)}>Delete</button></div>}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default TaskBoard

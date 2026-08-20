import api from './api.js'
import { getProjectError } from './projects.js'

export const getProjectTasks = (projectId) => api.get(`/api/projects/${projectId}/tasks`).then((response) => response.data)
export const createTask = (projectId, data) => api.post(`/api/projects/${projectId}/tasks`, data).then((response) => response.data)
export const updateTask = (taskId, data) => api.put(`/api/tasks/${taskId}`, data).then((response) => response.data)
export const updateTaskStatus = (taskId, status) => api.patch(`/api/tasks/${taskId}/status`, { status }).then((response) => response.data)
export const deleteTask = (taskId) => api.delete(`/api/tasks/${taskId}`)
export const getMyTasks = () => api.get('/api/tasks/my').then((response) => response.data)
export const getTaskError = getProjectError

import api from './api.js'
import { getProjectError } from './projects.js'

export const getTaskComments = (taskId) => api.get(`/api/tasks/${taskId}/comments`).then((response) => response.data)
export const createComment = (taskId, content) => api.post(`/api/tasks/${taskId}/comments`, { content }).then((response) => response.data)
export const deleteComment = (commentId) => api.delete(`/api/comments/${commentId}`)
export const getCommentError = getProjectError

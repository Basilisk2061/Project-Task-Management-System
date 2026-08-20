import api from './api.js'

export const getProjects = () => api.get('/api/projects').then((response) => response.data)
export const getProject = (id) => api.get(`/api/projects/${id}`).then((response) => response.data)
export const createProject = (data) => api.post('/api/projects', data).then((response) => response.data)
export const updateProject = (id, data) => api.put(`/api/projects/${id}`, data).then((response) => response.data)
export const completeProject = (id) => api.patch(`/api/projects/${id}/complete`).then((response) => response.data)
export const reopenProject = (id) => api.patch(`/api/projects/${id}/reopen`).then((response) => response.data)
export const deleteProject = (id) => api.delete(`/api/projects/${id}`)
export const getProjectMembers = (id) => api.get(`/api/projects/${id}/members`).then((response) => response.data)
export const searchUsers = (projectId, query = '') => api.get(`/api/projects/${projectId}/users/search`, {
  params: query.trim() ? { q: query.trim() } : undefined,
}).then((response) => response.data)
export const addProjectMember = (projectId, userId) => api.post(`/api/projects/${projectId}/members`, { user_id: userId }).then((response) => response.data)
export const removeProjectMember = (projectId, userId) => api.delete(`/api/projects/${projectId}/members/${userId}`)

export function getProjectError(error, fallbackMessage) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg.replace(/^Value error, /, '')
  }
  return fallbackMessage
}

import api from './api.js'

export const startGitHubOAuth = (projectId) => api.post(`/api/projects/${projectId}/github/oauth/start`).then((response) => response.data)
export const getGitHubRepositories = (projectId, query = '') => api.get(`/api/projects/${projectId}/github/repositories`, {
  params: query.trim() ? { q: query.trim() } : undefined,
}).then((response) => response.data)
export const connectGitHubRepository = (projectId, repository) => api.put(`/api/projects/${projectId}/github`, {
  owner: repository.owner,
  name: repository.name,
}).then((response) => response.data)
export const disconnectGitHubRepository = (projectId) => api.delete(`/api/projects/${projectId}/github`).then((response) => response.data)
export const getProjectGitHubCommits = (projectId) => api.get(`/api/projects/${projectId}/github/commits`).then((response) => response.data)
export const getTaskGitHubCommits = (projectId, taskId) => api.get(`/api/projects/${projectId}/tasks/${taskId}/github/commits`).then((response) => response.data)

export function getGitHubError(error, fallbackMessage) {
  const detail = error.response?.data?.detail
  return typeof detail === 'string' ? detail : fallbackMessage
}

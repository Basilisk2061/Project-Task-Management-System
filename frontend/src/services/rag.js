import api from './api.js'

export const getProjectAssistantStatus = (projectId) => api
  .get(`/api/projects/${projectId}/rag/status`)
  .then((response) => response.data)

export const getProjectAssistantConversations = (projectId) => api
  .get(`/api/projects/${projectId}/rag/conversations`)
  .then((response) => response.data)

export const createProjectAssistantConversation = (projectId) => api
  .post(`/api/projects/${projectId}/rag/conversations`)
  .then((response) => response.data)

export const getProjectAssistantHistory = (projectId, conversationId) => api
  .get(`/api/projects/${projectId}/rag/conversations/${conversationId}/history`)
  .then((response) => response.data)

export const deleteProjectAssistantConversation = (projectId, conversationId) => api
  .delete(`/api/projects/${projectId}/rag/conversations/${conversationId}`)

export const prepareProjectAssistant = (projectId) => api
  .post(`/api/projects/${projectId}/rag/index`)
  .then((response) => response.data)

export const askProjectAssistant = (projectId, conversationId, question) => api
  .post(`/api/projects/${projectId}/rag/conversations/${conversationId}/ask`, { question })
  .then((response) => response.data)

export function getRagError(error, fallbackMessage) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg.replace(/^Value error, /, '')
  }
  return fallbackMessage
}

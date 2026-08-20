import api from './api.js'
import { getProjectError } from './projects.js'

export const getProjectDocuments = (projectId) => api.get(`/api/projects/${projectId}/documents`).then((response) => response.data)

export const uploadProjectDocument = (projectId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/api/projects/${projectId}/documents`, formData).then((response) => response.data)
}

export const getDocumentBlob = (documentId) => api.get(`/api/documents/${documentId}/download`, { responseType: 'blob' }).then((response) => response.data)
export const deleteDocument = (documentId) => api.delete(`/api/documents/${documentId}`)

export async function getDocumentError(error, fallbackMessage) {
  if (error.response?.data instanceof Blob) {
    try {
      const payload = JSON.parse(await error.response.data.text())
      if (typeof payload.detail === 'string') return payload.detail
    } catch {
      return fallbackMessage
    }
  }
  return getProjectError(error, fallbackMessage)
}

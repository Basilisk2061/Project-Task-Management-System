import { useEffect, useState } from 'react'
import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking...')
  const [statusClass, setStatusClass] = useState('text-secondary')

  useEffect(() => {
    axios
      .get(`${apiBaseUrl}/api/health`)
      .then((response) => {
        if (response.data.status === 'ok') {
          setBackendStatus('Connected')
          setStatusClass('text-success')
        } else {
          setBackendStatus('Unexpected response')
          setStatusClass('text-warning')
        }
      })
      .catch(() => {
        setBackendStatus('Disconnected')
        setStatusClass('text-danger')
      })
  }, [])

  return (
    <main className="container py-5">
      <section className="app-panel border bg-white p-4">
        <h1 className="h3 mb-2">TaskFlow</h1>
        <p className="text-secondary mb-4">Project and Task Management System</p>
        <div className="border-top pt-3">
          <span className="fw-semibold">Backend Status: </span>
          <span className={statusClass}>{backendStatus}</span>
        </div>
      </section>
    </main>
  )
}

export default App


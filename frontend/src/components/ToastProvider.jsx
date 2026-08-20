import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, CloseIcon, InfoIcon } from './AppIcons.jsx'

const ToastContext = createContext(null)
const EXIT_DURATION = 220
const DEFAULT_DURATIONS = { success: 3600, info: 4000, warning: 4800, error: 5600 }
const ICONS = { success: CheckCircleIcon, error: AlertCircleIcon, warning: AlertTriangleIcon, info: InfoIcon }

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)
  const timers = useRef(new Map())
  const recent = useRef(new Map())

  const removeToast = useCallback((id) => {
    const toastTimers = timers.current.get(id)
    if (toastTimers) {
      window.clearTimeout(toastTimers.dismiss)
      window.clearTimeout(toastTimers.remove)
    }
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast))
    const toastTimers = timers.current.get(id) || {}
    window.clearTimeout(toastTimers.dismiss)
    window.clearTimeout(toastTimers.remove)
    toastTimers.remove = window.setTimeout(() => removeToast(id), EXIT_DURATION)
    timers.current.set(id, toastTimers)
  }, [removeToast])

  const showToast = useCallback((message, options = {}) => {
    const cleanedMessage = String(message || '').trim()
    if (!cleanedMessage) return null
    const type = options.type || 'success'
    const duplicateKey = `${type}:${cleanedMessage}`
    const now = Date.now()
    recent.current.forEach((timestamp, key) => {
      if (now - timestamp > 10000) recent.current.delete(key)
    })
    if (now - (recent.current.get(duplicateKey) || 0) < 1200) return null
    recent.current.set(duplicateKey, now)

    nextId.current += 1
    const id = nextId.current
    setToasts((current) => [...current, { id, message: cleanedMessage, type, closing: false }])
    const duration = options.duration ?? DEFAULT_DURATIONS[type] ?? DEFAULT_DURATIONS.info
    timers.current.set(id, { dismiss: window.setTimeout(() => dismissToast(id), duration) })
    return id
  }, [dismissToast])

  useEffect(() => () => {
    timers.current.forEach(({ dismiss, remove }) => {
      window.clearTimeout(dismiss)
      window.clearTimeout(remove)
    })
    timers.current.clear()
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] || InfoIcon
          return (
            <div className={`taskflow-toast ${toast.type}${toast.closing ? ' closing' : ''}`} role="status" key={toast.id}>
              <span className="toast-status-icon"><Icon /></span>
              <p>{toast.message}</p>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification"><CloseIcon /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export default ToastProvider

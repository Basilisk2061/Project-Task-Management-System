import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import { EyeIcon, LockIcon, UserIcon } from '../components/FormIcons.jsx'
import api from '../services/api.js'
import { PROFESSIONAL_ROLES } from '../constants/options.js'

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', professional_role: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/api/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        professional_role: form.professional_role,
      })
      navigate('/login', { replace: true, state: { registered: true } })
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Unable to create account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
        <header className="form-heading">
          <h1>Create your account</h1>
          <p>Get started with TaskFlow</p>
        </header>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="name">Full Name</label>
            <div className="input-with-icon">
              <span className="field-leading-icon"><UserIcon /></span>
              <input className="form-control" id="name" name="name" value={form.name}
                onChange={updateField} autoComplete="name" placeholder="Full name" required />
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="email">Email</label>
            <div className="input-with-icon">
              <span className="field-leading-icon"><UserIcon /></span>
              <input className="form-control" id="email" name="email" type="email"
                value={form.email} onChange={updateField} autoComplete="email"
                placeholder="you@example.com" required />
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="professional_role">Professional Role</label>
            <select className="form-select" id="professional_role" name="professional_role"
              value={form.professional_role} onChange={updateField} required>
              <option value="" disabled>Select your role</option>
              {PROFESSIONAL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="password-field">
              <span className="field-leading-icon"><LockIcon /></span>
              <input className="form-control" id="password" name="password"
                type={showPasswords ? 'text' : 'password'} value={form.password}
                onChange={updateField} autoComplete="new-password" required />
              <button type="button" onClick={() => setShowPasswords(!showPasswords)}
                aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>
                <EyeIcon hidden={showPasswords} />
              </button>
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-field">
              <span className="field-leading-icon"><LockIcon /></span>
              <input className="form-control" id="confirmPassword" name="confirmPassword"
                type={showPasswords ? 'text' : 'password'} value={form.confirmPassword}
                onChange={updateField} autoComplete="new-password" required />
              <button type="button" onClick={() => setShowPasswords(!showPasswords)}
                aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>
                <EyeIcon hidden={showPasswords} />
              </button>
            </div>
          </div>
          <button className="btn auth-submit w-100" type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="auth-alternate">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  )
}

export default Register

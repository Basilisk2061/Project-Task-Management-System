import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import { EyeIcon, LockIcon, UserIcon } from '../components/FormIcons.jsx'
import api, { removeToken, saveToken } from '../services/api.js'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const loginResponse = await api.post('/api/auth/login', form)
      saveToken(loginResponse.data.access_token)
      const currentUserResponse = await api.get('/api/auth/me')
      navigate('/app/dashboard', {
        replace: true,
        state: { authenticatedUser: currentUserResponse.data },
      })
    } catch (requestError) {
      removeToken()
      setError(requestError.response?.data?.detail || 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
        <header className="form-heading">
          <h1>Welcome back</h1>
          <p>Sign in to your account</p>
        </header>

        {location.state?.registered && (
          <div className="alert alert-success py-2" role="status">
            Account created successfully. You can now sign in.
          </div>
        )}
        {location.state?.authenticationError && (
          <div className="alert alert-danger py-2" role="alert">
            {location.state.authenticationError}
          </div>
        )}
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="email">Email</label>
            <div className="input-with-icon">
              <span className="field-leading-icon"><UserIcon /></span>
              <input className="form-control" id="email" name="email" type="email"
                value={form.email} onChange={updateField} autoComplete="email"
                placeholder="you@example.com" required />
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="password-field">
              <span className="field-leading-icon"><LockIcon /></span>
              <input className="form-control" id="password" name="password"
                type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={updateField} autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <EyeIcon hidden={showPassword} />
              </button>
            </div>
          </div>
          <button className="btn auth-submit w-100" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="auth-alternate">New to TaskFlow? <Link to="/register">Create an account</Link></p>
    </AuthLayout>
  )
}

export default Login

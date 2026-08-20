function AuthLayout({ children }) {
  return (
    <main className="auth-page">
      <div className="auth-brand" aria-label="TaskFlow">
        <span>TaskFlow</span>
      </div>
      <section className="auth-card">{children}</section>
    </main>
  )
}

export default AuthLayout

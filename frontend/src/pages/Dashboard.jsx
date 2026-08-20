const summaries = [
  'My Projects',
  'My Tasks',
  'Completed',
  'Pending',
]

function Dashboard() {
  return (
    <div className="dashboard-page">
      <p className="page-subtitle">Overview of your projects and assigned work.</p>

      <section className="summary-grid" aria-label="Work summary">
        {summaries.map((label, index) => (
          <article className="summary-card" key={label} style={{ '--card-order': index }}>
            <span>{label}</span>
            <strong>0</strong>
          </article>
        ))}
      </section>

      <div className="dashboard-sections">
        <section className="dashboard-panel">
          <h2>My Projects</h2>
          <div className="empty-state">
            <strong>No projects yet.</strong>
            <p>Projects you create or join will appear here.</p>
          </div>
        </section>

        <section className="dashboard-panel">
          <h2>Upcoming Tasks</h2>
          <div className="empty-state">
            <strong>No upcoming tasks.</strong>
            <p>Your assigned tasks with upcoming deadlines will appear here.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Dashboard

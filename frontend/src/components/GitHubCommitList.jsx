import { GitHubIcon } from './AppIcons.jsx'
import { formatRelativeTime } from '../utils/date.js'

function GitHubCommitList({ commits, emptyMessage }) {
  if (commits.length === 0) return <p className="github-commits-empty">{emptyMessage}</p>

  return <div className="github-commit-list">
    {commits.map((commit) => {
      const headline = commit.message.split(/\r?\n/, 1)[0] || 'Untitled commit'
      const author = commit.github_username || commit.author_name
      return (
        <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="github-commit-row" key={commit.sha}>
          <span className="github-commit-avatar">
            {commit.author_avatar_url ? <img src={commit.author_avatar_url} alt="" referrerPolicy="no-referrer" /> : <GitHubIcon />}
          </span>
          <span className="github-commit-main">
            <strong>{headline}</strong>
            <small>{author} · {formatRelativeTime(commit.committed_at)}</small>
          </span>
          <span className="github-commit-meta">
            {commit.task_ids.map((taskId) => <small className="github-task-reference" key={taskId}>TASK-{taskId}</small>)}
            <code>{commit.short_sha}</code>
          </span>
        </a>
      )
    })}
  </div>
}

export default GitHubCommitList

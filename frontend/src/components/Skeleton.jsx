function SkeletonBlock({ className = '' }) {
  return <span className={`skeleton-block${className ? ` ${className}` : ''}`} aria-hidden="true" />
}

export function SkeletonRows({ count = 3, variant = 'rows' }) {
  return (
    <div className={`skeleton-rows ${variant}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <SkeletonBlock className="icon" />
          <span className="skeleton-row-copy"><SkeletonBlock className="line primary" /><SkeletonBlock className="line secondary" /></span>
          <SkeletonBlock className="meta" />
        </div>
      ))}
    </div>
  )
}

export function ProjectGridSkeleton() {
  return <div className="skeleton-project-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-project-card" key={index}><SkeletonBlock className="line title" /><SkeletonBlock className="line body" /><SkeletonBlock className="line body short" /><div><SkeletonBlock className="meta" /><SkeletonBlock className="meta" /></div></div>)}</div>
}

export function TaskBoardSkeleton() {
  return <div className="skeleton-task-board" aria-hidden="true">{Array.from({ length: 3 }, (_, column) => <div className="skeleton-task-column" key={column}><SkeletonBlock className="line heading" />{Array.from({ length: 2 }, (_, card) => <div className="skeleton-task-card" key={card}><SkeletonBlock className="line title" /><SkeletonBlock className="line body" /><SkeletonBlock className="meta" /></div>)}</div>)}</div>
}

export function ProjectDetailsSkeleton() {
  return <div className="skeleton-project-details" aria-hidden="true"><div className="skeleton-detail-card"><SkeletonBlock className="line title" /><SkeletonBlock className="line body" /><div><SkeletonBlock className="meta" /><SkeletonBlock className="meta" /><SkeletonBlock className="meta" /></div></div><SkeletonRows count={3} variant="members" /><TaskBoardSkeleton /></div>
}

export default SkeletonBlock

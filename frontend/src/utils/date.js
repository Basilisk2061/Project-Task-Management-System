export function formatDate(value, options = {}) {
  if (!value) return 'Not set'

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: options.compact ? 'short' : 'short',
    year: options.compact ? undefined : 'numeric',
  }).format(date)
}

export function formatCreatedDate(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatCommentTimestamp(value) {
  if (!value) return 'Time unavailable'

  const date = new Date(value)
  const now = new Date()
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)

  if (isToday) return `Today, ${time}`

  const includeYear = date.getFullYear() !== now.getFullYear()
  const day = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
  }).format(date)
  return `${day}, ${time}`
}

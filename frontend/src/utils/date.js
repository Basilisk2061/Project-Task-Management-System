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

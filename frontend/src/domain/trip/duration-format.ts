export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`
}

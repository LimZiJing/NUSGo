export const LOCAL_DATA_VERSION = 'development'

export function parseDataVersion(input: unknown, label = 'NAVUS_DATA_VERSION'): string {
  if (typeof input !== 'string') throw new Error(`${label} must be a full 40-character commit SHA or development`)

  const version = input.trim()
  if (version === LOCAL_DATA_VERSION) return version
  if (!/^[a-f0-9]{40}$/i.test(version)) {
    throw new Error(`${label} must be a full 40-character commit SHA or development`)
  }

  return version.toLowerCase()
}

export function assertCompatibleDataVersion(expected: string, actual: string): void {
  if (expected !== actual) throw new Error('Frontend and backend data versions do not match')
}

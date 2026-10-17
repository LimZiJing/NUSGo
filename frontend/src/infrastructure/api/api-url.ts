declare const __NAVUS_API_ORIGIN__: string
export function buildApiUrl(path: string, apiOrigin = __NAVUS_API_ORIGIN__): string {
  if (!path.startsWith('/api/')) {
    throw new Error('API URL path must start with /api/')
  }
  // API requests stay at the server root, separate from the frontend asset base.
  return apiOrigin ? new URL(path, apiOrigin).toString() : path
}

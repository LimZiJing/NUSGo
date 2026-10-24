import { parseApiOrigin } from '../shared/src/index.ts'

export interface ViteBuildSettings {
  readonly apiOrigin: string
  readonly base: string
  readonly outDir: string
}

function isLoopbackApiOrigin(value: string): boolean {
  const { hostname, protocol } = new URL(value)
  return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function parsePagesBasePath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('VITE_BASE_PATH must be an absolute path ending with a slash')
  }

  const segments = value === '/' ? [] : value.slice(1, -1).split('/')
  if (
    !value.startsWith('/') ||
    !value.endsWith('/') ||
    value.startsWith('//') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes(String.fromCharCode(92)) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('VITE_BASE_PATH must be an absolute path ending with a slash')
  }

  return value
}

/** Keep hosted builds and local rehearsals pointed at their intended API boundary. */
export function resolveViteBuildSettings(
  mode: string,
  apiOriginInput: unknown,
  pagesBasePathInput: unknown = '/NUSGo/',
): ViteBuildSettings {
  const isProduction = mode === 'production'
  const isLocalRehearsal = mode === 'local-rehearsal'
  const apiOrigin = parseApiOrigin(apiOriginInput, 'VITE_API_ORIGIN', {
    requireHttps: isProduction,
  })

  if (!apiOrigin && (isProduction || isLocalRehearsal)) {
    throw new Error('VITE_API_ORIGIN must be explicitly set for production and local-rehearsal builds')
  }
  if (isLocalRehearsal && !isLoopbackApiOrigin(apiOrigin)) {
    throw new Error('VITE_API_ORIGIN must use HTTP on a loopback address in local-rehearsal mode')
  }

  return Object.freeze({
    apiOrigin,
    base: isProduction ? parsePagesBasePath(pagesBasePathInput) : '/',
    // Keep loopback rehearsal assets out of dist, which the Pages workflow publishes.
    outDir: isLocalRehearsal ? 'dist-local-rehearsal' : 'dist',
  })
}

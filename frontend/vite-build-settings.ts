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

/** Keep hosted builds and local rehearsals pointed at their intended API boundary. */
export function resolveViteBuildSettings(mode: string, apiOriginInput: unknown): ViteBuildSettings {
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
    base: isProduction ? '/NavUS/' : '/',
    // Keep loopback rehearsal assets out of dist, which the Pages workflow publishes.
    outDir: isLocalRehearsal ? 'dist-local-rehearsal' : 'dist',
  })
}

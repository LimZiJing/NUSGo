import { resolve } from 'node:path'
import { LOCAL_DATA_VERSION, parseCorsOrigins, parseDataVersion } from '@navus/shared'

const PAGES_ORIGIN = 'https://limzijing.github.io'
const DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  PAGES_ORIGIN,
])

export interface BackendConfig {
  readonly environment: 'development' | 'test' | 'production'
  readonly host: string
  readonly port: number
  readonly corsOrigins: readonly string[]
  readonly dataVersion: string
  readonly dataDirectory: string
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3001
  if (!/^\d+$/.test(value.trim())) throw new Error('PORT must be an integer from 1 to 65535')
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535')
  }
  return port
}

function parseEnvironment(value: string | undefined): BackendConfig['environment'] {
  const environment = value?.trim() || 'development'
  if (environment !== 'development' && environment !== 'test' && environment !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production')
  }
  return environment
}

export function loadBackendConfig(
  environment: Record<string, string | undefined> = process.env,
  workingDirectory = process.cwd(),
): BackendConfig {
  const mode = parseEnvironment(environment.NODE_ENV)
  const host = environment.HOST?.trim() || '127.0.0.1'
  if (mode === 'production' && host !== '127.0.0.1' && host !== '::1') {
    throw new Error('HOST must use loopback in production so the TLS proxy owns public traffic')
  }

  let corsOrigins: readonly string[]
  if (environment.API_CORS_ORIGINS?.trim()) {
    corsOrigins = parseCorsOrigins(environment.API_CORS_ORIGINS)
  } else if (mode === 'production') {
    throw new Error('API_CORS_ORIGINS is required in production')
  } else {
    corsOrigins = DEVELOPMENT_ORIGINS
  }

  if (mode === 'production') {
    if (!corsOrigins.includes(PAGES_ORIGIN)) {
      throw new Error(`API_CORS_ORIGINS must include ${PAGES_ORIGIN}`)
    }
    if (corsOrigins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error('Production API_CORS_ORIGINS entries must use HTTPS')
    }
  }

  const dataVersion = parseDataVersion(
    environment.NAVUS_DATA_VERSION ?? environment.GITHUB_SHA ?? LOCAL_DATA_VERSION,
  )
  if (mode === 'production' && dataVersion === LOCAL_DATA_VERSION) {
    throw new Error('NAVUS_DATA_VERSION must be the deployed source commit in production')
  }

  const dataPath = environment.NAVUS_DATA_DIR?.trim() || '../frontend/public/data'
  return Object.freeze({
    environment: mode,
    host,
    port: parsePort(environment.PORT),
    corsOrigins,
    dataVersion,
    dataDirectory: resolve(workingDirectory, dataPath),
  })
}

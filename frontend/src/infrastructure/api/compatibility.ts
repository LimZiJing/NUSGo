import { buildApiUrl } from './api-url'
import { assertCompatibleDataVersion, parseDataVersion } from '@nusgo/shared/http/data-version'
import type { ApiHealthResponse } from '@nusgo/shared/http/api-contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseApiHealthResponse(value: unknown): ApiHealthResponse {
  if (!isRecord(value) || value.status !== 'ok') {
    throw new Error('Backend health response is invalid')
  }

  return {
    status: 'ok',
    dataVersion: parseDataVersion(value.dataVersion, 'Backend data version'),
  }
}

export async function checkApiDataVersion(
  apiOrigin: string,
  expectedDataVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const expectedVersion = parseDataVersion(expectedDataVersion, 'Frontend data version')
  const healthUrl = buildApiUrl('/api/health', apiOrigin)
  const response = await fetcher(healthUrl, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Backend health check returned HTTP ${response.status}`)

  const payload: unknown = await response.json()
  const health = parseApiHealthResponse(payload)
  assertCompatibleDataVersion(expectedVersion, health.dataVersion)
}

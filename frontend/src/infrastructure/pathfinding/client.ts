import type {
  ApiJourneyPlanningError,
  ApiJourneyPlanningRequest,
  ApiJourneyPlanningResponse,
} from '@navus/shared/routing/path'
import { buildApiUrl } from '../api/api-url.ts'

export interface JourneyPlanningClientOptions {
  readonly endpoint?: string
  readonly apiOrigin?: string
  readonly fetcher?: typeof fetch
  readonly getSimulatedDepartureMs?: () => number | null
}

export type JourneyPlanningClient = (
  request: ApiJourneyPlanningRequest,
  context: { readonly signal: AbortSignal },
) => Promise<ApiJourneyPlanningResponse>

export class JourneyPlanningRequestError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'JourneyPlanningRequestError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseResponse(value: unknown): ApiJourneyPlanningResponse {
  if (!isRecord(value)) throw new Error('Journey planning response was invalid')
  if (value.outcome === 'no-path' && (
    value.message === undefined || typeof value.message === 'string'
  )) {
    return value as ApiJourneyPlanningResponse
  }
  if (value.outcome === 'paths' && Array.isArray(value.candidates) &&
    (value.searchStatus === 'complete' || value.searchStatus === 'budget-exceeded')) {
    return value as ApiJourneyPlanningResponse
  }
  throw new Error('Journey planning response was invalid')
}

async function parseError(response: Response): Promise<JourneyPlanningRequestError> {
  let body: ApiJourneyPlanningError | null = null
  try {
    const value: unknown = await response.json()
    if (isRecord(value) && typeof value.error === 'string') {
      body = value as unknown as ApiJourneyPlanningError
    }
  } catch {
    // Preserve a stable error when the server's error body cannot be read.
  }
  return new JourneyPlanningRequestError(
    response.status,
    body?.error ?? 'Journey planning request failed',
    body?.code,
  )
}

/** Sends endpoint identities only; the backend resolves all canonical data and routing geometry. */
export function createJourneyPlanningClient(
  options: JourneyPlanningClientOptions = {},
): JourneyPlanningClient {
  const endpoint = options.endpoint ?? buildApiUrl('/api/journeys', options.apiOrigin)
  const fetcher = options.fetcher ?? fetch

  return async (request, context) => {
    const simulatedDepartureMs = options.getSimulatedDepartureMs?.()
    const body: ApiJourneyPlanningRequest = simulatedDepartureMs === null || simulatedDepartureMs === undefined
      ? { origin: request.origin, destination: request.destination }
      : { origin: request.origin, destination: request.destination, simulatedDepartureMs }

    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: context.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new JourneyPlanningRequestError(0, 'Journey planning request failed')
    }

    if (!response.ok) throw await parseError(response)
    try {
      return parseResponse(await response.json() as unknown)
    } catch (error) {
      if (error instanceof JourneyPlanningRequestError) throw error
      throw new JourneyPlanningRequestError(response.status, 'Journey planning response was invalid')
    }
  }
}

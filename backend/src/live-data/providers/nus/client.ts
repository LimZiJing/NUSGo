import { fetchWithTimeout, UpstreamTimeoutError } from '../../timeouts.ts'
import type { NusProviderConfig } from '../../../config.ts'
export interface NusApiSession {
  readonly token: string
  readonly userId: string
  readonly domain: string
}

export interface NusApiRequest {
  readonly url: string
  readonly init: RequestInit
}

export function createNusBusProxyRequest(
  provider: NusProviderConfig,
  session: NusApiSession,
  deviceId: string,
  endpoint: string,
  extraBody: Record<string, string>,
): NusApiRequest {
  return {
    url: provider.busProxyBaseUrl + '/univus/api/bus-proxy/' + endpoint,
    init: {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.token,
        'Content-Type': 'application/json; charset=utf-8',
        'X-HTD-API': provider.htdApi,
        'X-APP-API': provider.appApi,
        'X-API-KEY': provider.apiKey,
      },
      body: JSON.stringify({
        ...extraBody,
        deviceid: deviceId,
        domain: session.domain,
        ipaddr: provider.ipaddr,
        token: session.token,
        userid: session.userId,
        version: provider.version,
      }),
    },
  }
}

export interface NusAuthenticatedClient {
  requestJson(
    requestFactory: (session: NusApiSession) => NusApiRequest,
    resourceName: string,
    signal?: AbortSignal,
  ): Promise<unknown>
}

export interface NusAuthenticatedClientOptions {
  readonly accessTokenUrl: string
  readonly htdApi: string
  readonly appApi: string
  readonly deviceId: string
  readonly ipaddr: string
  readonly version: string
  readonly initialToken?: string
  readonly initialUserId?: string
  readonly initialDomain?: string
  readonly fetcher?: typeof fetch
  readonly requestTimeoutMs?: number
}

export class NusAuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NusAuthenticationError'
  }
}

export class NusRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'NusRequestError'
    this.status = status
  }
}

export class NusSessionExpiredError extends NusRequestError {
  constructor(message = 'The NUS session remained expired after refreshing the token') {
    super(message)
    this.name = 'NusSessionExpiredError'
  }
}

function isRetryableNusError(error: unknown): boolean {
  if (!(error instanceof NusRequestError)) return false
  return error.status === null || error.status === 429 || error.status >= 500
}

export async function retryNusRequest<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  attempts: number,
  baseDelayMs: number,
): Promise<T> {
  let retries = 0
  while (true) {
    try {
      return await operation()
    } catch (error: unknown) {
      if (!isRetryableNusError(error) || retries >= attempts || signal.aborted) throw error
      const delayMs = baseDelayMs * (2 ** retries)
      retries += 1
      if (delayMs === 0) continue
      await new Promise<void>((resolveDelay, rejectDelay) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolveDelay()
        }, delayMs)
        timer.unref?.()
        const abort = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          rejectDelay(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
        }
        signal.addEventListener('abort', abort, { once: true })
      })
    }
  }
}

interface JsonRecord {
  readonly [key: string]: unknown
}

interface ParsedAccessToken {
  readonly session: NusApiSession
}

interface NUSResponse {
  readonly payload: unknown
  readonly status: number
}

const SESSION_EXPIRED_CODE = '10011'

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NusAuthenticationError(`NUS access-token response has no valid ${label}`)
  }
  return value.trim()
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}

export function parseNusAccessTokenResponse(input: unknown): ParsedAccessToken {
  if (!isRecord(input) || !isRecord(input.data)) {
    throw new NusAuthenticationError('NUS access-token response was invalid')
  }

  return {
    session: {
      token: requireText(input.data.token, 'token'),
      userId: requireText(input.data.userid, 'userid'),
      domain: requireText(input.data.domain, 'domain'),
    },
  }
}

export function isNusSessionExpiredResponse(input: unknown): boolean {
  return isRecord(input) && input.code === SESSION_EXPIRED_CODE
}

async function readJsonResponse(
  fetcher: typeof fetch,
  request: NusApiRequest,
  resourceName: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<NUSResponse> {
  let response: Response
  try {
    response = await fetchWithTimeout(fetcher, request.url, request.init, timeoutMs, signal)
  } catch (error: unknown) {
    if (error instanceof UpstreamTimeoutError) {
      throw new NusRequestError('NUS ' + resourceName + ' request timed out')
    }
    if (isAbortError(error) && signal?.aborted) throw error
    throw new NusRequestError('NUS ' + resourceName + ' request failed')
  }

  let payload: unknown
  try {
    payload = await response.json() as unknown
  } catch (error: unknown) {
    if (error instanceof UpstreamTimeoutError) {
      throw new NusRequestError('NUS ' + resourceName + ' request timed out')
    }
    if (isAbortError(error) && signal?.aborted) throw error
    throw new NusRequestError('NUS ' + resourceName + ' response was not valid JSON', response.status)
  }

  if (!response.ok && !isNusSessionExpiredResponse(payload)) {
    throw new NusRequestError('NUS ' + resourceName + ' request failed: ' + response.status, response.status)
  }

  return { payload, status: response.status }
}
export function createNusAuthenticatedClient(
  options: NusAuthenticatedClientOptions,
): NusAuthenticatedClient {
  const accessTokenUrl = options.accessTokenUrl.trim()
  const fetcher = options.fetcher ?? fetch
  const requestTimeoutMs = options.requestTimeoutMs ?? 8_000
  let session: NusApiSession | null = options.initialToken?.trim() && options.initialUserId?.trim()
    ? {
      token: options.initialToken.trim(),
      userId: options.initialUserId.trim(),
      domain: options.initialDomain?.trim() || 'PUBLIC',
    }
    : null
  let refreshInFlight: Promise<NusApiSession> | null = null

  if (!accessTokenUrl) throw new NusAuthenticationError('NUS access-token URL is required')

  const refreshSession = async (expiredToken?: string, signal?: AbortSignal): Promise<NusApiSession> => {
    if (expiredToken && session && session.token !== expiredToken) return session
    if (refreshInFlight) return refreshInFlight

    const refresh = (async (): Promise<NusApiSession> => {
      const response = await readJsonResponse(fetcher, {
        url: accessTokenUrl,
        init: {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'X-HTD-API': options.htdApi,
            'X-APP-API': options.appApi,
          },
          body: JSON.stringify({
            deviceid: options.deviceId,
            ipaddr: options.ipaddr,
            version: options.version,
          }),
        },
      }, 'access-token', requestTimeoutMs, signal)

      try {
        const parsed = parseNusAccessTokenResponse(response.payload)
        session = parsed.session
        return parsed.session
      } catch (error: unknown) {
        if (error instanceof NusAuthenticationError) throw error
        throw new NusAuthenticationError('NUS access-token response was invalid')
      }
    })()

    refreshInFlight = refresh
    try {
      return await refresh
    } finally {
      if (refreshInFlight === refresh) refreshInFlight = null
    }
  }

  const getSession = async (signal?: AbortSignal): Promise<NusApiSession> => session ?? refreshSession(undefined, signal)

  return {
    async requestJson(requestFactory, resourceName, signal) {
      const initialSession = await getSession(signal)
      const firstResponse = await readJsonResponse(
        fetcher,
        requestFactory(initialSession),
        resourceName,
        requestTimeoutMs,
        signal,
      )
      if (!isNusSessionExpiredResponse(firstResponse.payload)) return firstResponse.payload

      const refreshedSession = await refreshSession(initialSession.token, signal)
      const retryResponse = await readJsonResponse(
        fetcher,
        requestFactory(refreshedSession),
        resourceName,
        requestTimeoutMs,
        signal,
      )
      if (isNusSessionExpiredResponse(retryResponse.payload)) {
        throw new NusSessionExpiredError()
      }
      return retryResponse.payload
    },
  }
}

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import {
  SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS,
  type ShuttleRouteArrivalData,
} from './src/domain/transit/arrivals.js'
import { parseShuttleServiceResponse } from './src/infrastructure/shuttle-arrivals/response.js'
import type { ShuttleServiceWindow } from './src/domain/transit/service-hours.js'
import { parseRouteServiceWindows } from './src/infrastructure/shuttle-service-hours/response.js'
import {
  createNusAuthenticatedClient,
  type NusApiRequest,
  type NusApiSession,
  type NusAuthenticatedClient,
} from './src/infrastructure/nus-api/client.js'

interface RequestedStop {
  readonly stopId: string
  readonly stopName: string
}

interface CachedStopArrival {
  readonly observedAt: string
  readonly expiresAt: string
  readonly routes: Record<string, ShuttleRouteArrivalData>
}

interface CachedServiceWindows {
  readonly expiresAt: string
  readonly windows: readonly ShuttleServiceWindow[]
}

const SHUTTLE_CACHE_TTL_MS = SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS
const SERVICE_WINDOWS_CACHE_TTL_MS = 600_000
const DEFAULT_ACCESS_TOKEN_URL = 'https://myizaac2.nus.edu.sg/univus-public/mobile/get-access-token'

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function parseRequestedStops(value: string | null): readonly RequestedStop[] {
  if (!value) throw new Error('The stops query is required')
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 16) {
    throw new Error('The stops query must contain between 1 and 16 stops')
  }
  const seen = new Set<string>()
  const stops: RequestedStop[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Each requested stop must be an object')
    }
    const stop = item as { stopId?: unknown; stopName?: unknown }
    if (
      typeof stop.stopId !== 'string' ||
      typeof stop.stopName !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(stop.stopId) ||
      stop.stopName.trim().length === 0 ||
      stop.stopName.length > 160
    ) throw new Error('Each requested stop must have a valid ID and name')
    if (seen.has(stop.stopId)) continue
    seen.add(stop.stopId)
    stops.push({ stopId: stop.stopId, stopName: stop.stopName.trim() })
  }
  return stops
}

function getRequiredEnv(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing server setting ${name}`)
  return value
}

function createBusProxyRequest(
  env: Record<string, string>,
  session: NusApiSession,
  deviceId: string,
  endpoint: string,
  extraBody: Record<string, string>,
): NusApiRequest {
  const baseUrl = getRequiredEnv(env, 'NUS_BUS_PROXY_BASE_URL').replace(/\/+$/, '')
  const body = {
    ...extraBody,
    deviceid: deviceId,
    domain: session.domain,
    ipaddr: env.NUS_IPADDR?.trim() || '0.0.0.0',
    token: session.token,
    userid: session.userId,
    version: env.NUS_APP_VERSION?.trim() || 'univus_android_2.59.2_140',
  }
  return {
    url: `${baseUrl}/univus/api/bus-proxy/${endpoint}`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-HTD-API': getRequiredEnv(env, 'NUS_X_HTD_API'),
        'X-APP-API': getRequiredEnv(env, 'NUS_X_APP_API'),
        'X-API-KEY': getRequiredEnv(env, 'NUS_X_API_KEY'),
      },
      body: JSON.stringify(body),
    },
  }
}

function createShuttleArrivalsPlugin(env: Record<string, string>): Plugin {
  const cache = new Map<string, CachedStopArrival>()
  const inFlight = new Map<string, Promise<CachedStopArrival | null>>()
  const serviceWindowsCache = new Map<string, CachedServiceWindows>()
  const serviceWindowsInFlight = new Map<string, Promise<CachedServiceWindows | null>>()
  let nusClient: NusAuthenticatedClient | null = null
  let deviceId: string | null = null

  const getNusClient = (): NusAuthenticatedClient => {
    if (nusClient) return nusClient
    deviceId = env.NUS_DEVICE_ID?.trim() || randomUUID()
    nusClient = createNusAuthenticatedClient({
      accessTokenUrl: env.NUS_ACCESS_TOKEN_URL?.trim() || DEFAULT_ACCESS_TOKEN_URL,
      htdApi: getRequiredEnv(env, 'NUS_X_HTD_API'),
      appApi: getRequiredEnv(env, 'NUS_X_APP_API'),
      deviceId,
      ipaddr: env.NUS_IPADDR?.trim() || '0.0.0.0',
      version: env.NUS_APP_VERSION?.trim() || 'univus_android_2.59.2_140',
      initialToken: env.NUS_UNIVUS_JWT,
      initialUserId: env.NUS_USER_ID,
      initialDomain: env.NUS_DOMAIN,
    })
    return nusClient
  }

  const loadStop = async (stopName: string): Promise<CachedStopArrival | null> => {
    const cached = cache.get(stopName)
    if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached
    const existing = inFlight.get(stopName)
    if (existing) return existing

    const request = (async () => {
      try {
        const payload = await getNusClient().requestJson((session) => createBusProxyRequest(
          env,
          session,
          deviceId!,
          'shuttle-service',
          { busstopname: stopName },
        ), 'shuttle-service')
        const parsed = parseShuttleServiceResponse(payload)
        const observedAt = new Date().toISOString()
        const entry: CachedStopArrival = {
          observedAt,
          expiresAt: new Date(Date.now() + SHUTTLE_CACHE_TTL_MS).toISOString(),
          routes: Object.fromEntries(parsed.map((route) => [route.routeId, route.arrival])),
        }
        cache.set(stopName, entry)
        return entry
      } catch (error: unknown) {
        console.warn(`NUS shuttle-service data unavailable for ${stopName}.`, error)
        return null
      } finally {
        inFlight.delete(stopName)
      }
    })()
    inFlight.set(stopName, request)
    return request
  }

  const loadServiceWindows = async (routeId: string): Promise<CachedServiceWindows | null> => {
    const cached = serviceWindowsCache.get(routeId)
    if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached
    const existing = serviceWindowsInFlight.get(routeId)
    if (existing) return existing

    const request = (async () => {
      try {
        const payload = await getNusClient().requestJson((session) => createBusProxyRequest(
          env,
          session,
          deviceId!,
          'route-min-max-time',
          { route_code: routeId },
        ), 'route-min-max-time')
        const entry: CachedServiceWindows = {
          expiresAt: new Date(Date.now() + SERVICE_WINDOWS_CACHE_TTL_MS).toISOString(),
          windows: parseRouteServiceWindows(payload, routeId),
        }
        serviceWindowsCache.set(routeId, entry)
        return entry
      } catch (error: unknown) {
        console.warn(`NUS route service-hour data unavailable for ${routeId}.`, error)
        return null
      } finally {
        serviceWindowsInFlight.delete(routeId)
      }
    })()
    serviceWindowsInFlight.set(routeId, request)
    return request
  }

  return {
    name: 'navus-shuttle-arrivals',
    configureServer(server) {
      server.middlewares.use('/api/shuttle-arrivals', (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'Only GET is supported' })
          return
        }

        void (async () => {
          try {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const stops = parseRequestedStops(url.searchParams.get('stops'))
            const entries = await Promise.all(stops.map(async (stop) => ({
              stopId: stop.stopId,
              entry: await loadStop(stop.stopName),
            })))
            const available = entries.filter((item): item is { stopId: string; entry: CachedStopArrival } => item.entry !== null)
            if (available.length === 0) {
              sendJson(response, 503, { error: 'No shuttle arrival data is available' })
              return
            }
            const observedAt = available.map((item) => item.entry.observedAt).sort()[0]
            const expiresAt = available.map((item) => item.entry.expiresAt).sort()[0]
            sendJson(response, 200, {
              observedAt,
              expiresAt,
              stops: Object.fromEntries(available.map((item) => [item.stopId, item.entry.routes])),
            })
          } catch (error: unknown) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : 'Invalid shuttle arrival request',
            })
          }
        })()
      })
      server.middlewares.use('/api/shuttle-service-windows', (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'Only GET is supported' })
          return
        }

        void (async () => {
          try {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const routeIds = [...new Set((url.searchParams.get('routes') ?? '')
              .split(',')
              .map((routeId) => routeId.trim())
              .filter((routeId) => /^[A-Za-z0-9_-]{1,40}$/.test(routeId)))]
            if (routeIds.length === 0 || routeIds.length > 16) {
              throw new Error('The routes query must contain between 1 and 16 route IDs')
            }
            const entries = await Promise.all(routeIds.map(async (routeId) => ({
              routeId,
              entry: await loadServiceWindows(routeId),
            })))
            if (entries.some(({ entry }) => entry === null)) {
              sendJson(response, 503, { error: 'No shuttle service-hour data is available' })
              return
            }
            sendJson(response, 200, {
              routes: Object.fromEntries(entries.map(({ routeId, entry }) => [routeId, entry?.windows ?? []])),
            })
          } catch (error: unknown) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : 'Invalid shuttle service-hour request',
            })
          }
        })()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHost = env.NAVUS_VITE_ALLOWED_HOST?.trim()

  return {
    base: mode === 'production' ? '/NavUS/' : '/',
    plugins: [react(), createShuttleArrivalsPlugin(env)],
    server: {
      ...(allowedHost ? { allowedHosts: [allowedHost] } : {}),
      proxy: {
        '/valhalla': {
          target: 'http://127.0.0.1:8002',
          rewrite: (path) => path.replace(/^\/valhalla/, ''),
        },
      },
    },
  }
})

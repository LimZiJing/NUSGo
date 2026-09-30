import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { parseCanonicalShuttleStops } from './src/infrastructure/shuttle-arrivals/canonical.js'
import { parseShuttleArrivalRefreshInterval } from './src/infrastructure/shuttle-arrivals/config.js'
import { parseShuttleServiceResponse } from './src/infrastructure/shuttle-arrivals/response.js'
import {
  createShuttleArrivalSnapshotStore,
  type ShuttleArrivalSnapshotStore,
  type ShuttleArrivalStop,
  type ShuttleArrivalStopResult,
} from './src/infrastructure/shuttle-arrivals/snapshot.js'
import { parseRequestedStops, selectRequestedStops } from './src/infrastructure/shuttle-arrivals/request.js'
import type { ShuttleServiceWindow } from './src/domain/transit/service-hours.js'
import { parseRouteServiceWindows } from './src/infrastructure/shuttle-service-hours/response.js'
import {
  createNusAuthenticatedClient,
  NusRequestError,
  type NusApiRequest,
  type NusApiSession,
  type NusAuthenticatedClient,
} from './src/infrastructure/nus-api/client.js'

type RequestedStop = ShuttleArrivalStop

interface CachedServiceWindows {
  readonly expiresAt: string
  readonly windows: readonly ShuttleServiceWindow[]
}

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

function loadCanonicalStops(): readonly RequestedStop[] {
  return parseCanonicalShuttleStops(JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/data/shuttle-network.json'), 'utf8'),
  ) as unknown)
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
  const canonicalStops = loadCanonicalStops()
  const refreshIntervalMs = parseShuttleArrivalRefreshInterval(env)
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

  const loadStop = async (
    stop: ShuttleArrivalStop,
    signal: AbortSignal,
  ): Promise<ShuttleArrivalStopResult> => {
    const payload = await getNusClient().requestJson((session) => {
      const request = createBusProxyRequest(
        env,
        session,
        deviceId!,
        'shuttle-service',
        { busstopname: stop.stopName },
      )
      return { ...request, init: { ...request.init, signal } }
    }, 'shuttle-service')
    const parsed = parseShuttleServiceResponse(payload)
    const observedAt = new Date().toISOString()
    return {
      observedAt,
      expiresAt: new Date(Date.now() + refreshIntervalMs).toISOString(),
      routes: Object.fromEntries(parsed.map((route) => [route.routeId, route.arrival])),
    }
  }

  const snapshotStore: ShuttleArrivalSnapshotStore = createShuttleArrivalSnapshotStore({
    stops: canonicalStops,
    loadStop,
    refreshIntervalMs,
    onRefreshComplete(log, failures) {
      const statusCounts: Record<string, number> = {}
      for (const { error } of failures) {
        const status = error instanceof NusRequestError && error.status !== null
          ? String(error.status)
          : 'unknown'
        statusCounts[status] = (statusCounts[status] ?? 0) + 1
      }
      console.info('NUS shuttle arrival refresh completed.', {
        ...log,
        httpStatusCounts: statusCounts,
      })
      if (failures.length > 0) {
        console.warn('NUS shuttle arrival refresh had failed stops.', {
          stopIds: failures.map(({ stopId }) => stopId),
          httpStatusCounts: statusCounts,
        })
      }
    },
  })

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
      if (process.env.VITEST === 'true') return
      snapshotStore.start()
      server.httpServer?.once('close', () => snapshotStore.stop())
      server.middlewares.use('/api/shuttle-arrivals', (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'Only GET is supported' })
          return
        }

        void (async () => {
          try {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const stops = parseRequestedStops(url.searchParams.get('stops'), canonicalStops)
            const snapshot = snapshotStore.getSnapshot()
            if (!snapshot) {
              sendJson(response, 503, { error: 'Shuttle arrival snapshot is still initializing' })
              return
            }
            sendJson(response, 200, selectRequestedStops(snapshot, stops))
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
      host: '0.0.0.0',
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

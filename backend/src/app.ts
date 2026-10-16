import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'
import type {
  ApiErrorCode,
  ApiErrorResponse,
  ApiHealthResponse,
  ApiNotReadyResponse,
  ApiReadinessResponse,
  ApiReadyResponse,
} from '@navus/shared'
import type { BackendConfig } from './config.ts'
import type { BackendData } from './data.ts'
import { LiveDataRequestError, type BackendLiveData } from './live-data/runtime.ts'

const BODY_LIMIT = '32kb'
const MAX_URL_LENGTH = 2048
const ALLOWED_METHODS = 'GET, HEAD, POST, OPTIONS'
const ALLOWED_HEADERS = new Set(['accept', 'content-type'])

function sendError(
  response: Response,
  status: number,
  error: string,
  code?: ApiErrorCode,
): void {
  const body: ApiErrorResponse = { error, ...(code ? { code } : {}) }
  response.status(status).json(body)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function corsMiddleware(origins: readonly string[]): RequestHandler {
  const originSet = new Set(origins)

  return (request, response, next) => {
    const origin = request.get('origin')
    if (origin) {
      response.vary('Origin')
      if (!originSet.has(origin)) {
        sendError(response, 403, 'Origin is not allowed')
        return
      }
      response.setHeader('Access-Control-Allow-Origin', origin)
    }

    if (request.method === 'OPTIONS') {
      const requestedMethod = request.get('access-control-request-method')?.toUpperCase()
      if (requestedMethod && !['GET', 'HEAD', 'POST'].includes(requestedMethod)) {
        sendError(response, 403, 'Requested method is not allowed')
        return
      }

      const requestedHeaders = request.get('access-control-request-headers')
        ?.split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean) ?? []
      if (requestedHeaders.some((header) => !ALLOWED_HEADERS.has(header))) {
        sendError(response, 403, 'Requested headers are not allowed')
        return
      }

      response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
      if (requestedHeaders.length > 0) {
        response.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '))
      }
      response.setHeader('Access-Control-Max-Age', '600')
      response.status(204).end()
      return
    }

    next()
  }
}

function errorHandler(): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }

    const type = isRecord(error) ? error.type : undefined
    const status = isRecord(error) ? error.status : undefined
    if (type === 'entity.too.large' || status === 413) {
      sendError(response, 413, 'Request body is too large')
      return
    }
    if (type === 'entity.parse.failed' || status === 400) {
      sendError(response, 400, 'Request body is not valid JSON')
      return
    }

    console.error('Unhandled API request failure', {
      method: request.method,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    sendError(response, 500, 'Internal server error')
  }
}

function queryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function liveDataHandler(
  liveData: BackendLiveData | null,
  selectQuery: (request: Request) => unknown,
  load: (liveData: BackendLiveData, query: string | null, signal: AbortSignal) => unknown | Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    if (!liveData) {
      sendError(response, 503, 'Live transit data is not ready', 'not_ready')
      return
    }

    const controller = new AbortController()
    const abortWhenDisconnected = () => {
      if (!response.writableEnded) controller.abort()
    }
    const onRequestAborted = () => controller.abort()
    request.once('aborted', onRequestAborted)
    response.once('close', abortWhenDisconnected)

    void Promise.resolve()
      .then(() => load(liveData, queryValue(selectQuery(request)), controller.signal))
      .then((body) => {
        if (!controller.signal.aborted && !response.writableEnded) response.json(body)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        if (error instanceof LiveDataRequestError) {
          sendError(response, error.status, error.message, error.code)
          return
        }
        next(error)
      })
      .finally(() => {
        request.removeListener('aborted', onRequestAborted)
        response.removeListener('close', abortWhenDisconnected)
      })
  }
}

function methodNotAllowed(): RequestHandler {
  return (_request, response) => {
    response.setHeader('Allow', 'GET, HEAD, OPTIONS')
    sendError(response, 405, 'Only GET is supported', 'invalid_request')
  }
}

export function createApp(
  config: Pick<BackendConfig, 'corsOrigins' | 'dataVersion'>,
  data: BackendData | null,
  liveData: BackendLiveData | null = null,
): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', (_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use('/api', corsMiddleware(config.corsOrigins))
  app.use('/api', (request, response, next) => {
    if (request.originalUrl.length > MAX_URL_LENGTH) {
      sendError(response, 414, 'Request URL is too long', 'invalid_request')
      return
    }
    next()
  })
  app.use('/api', express.json({ limit: BODY_LIMIT, strict: true }))

  app.get('/api/health', (_request, response) => {
    const body: ApiHealthResponse = { status: 'ok', dataVersion: config.dataVersion }
    response.json(body)
  })
  app.get('/api/ready', (_request, response) => {
    const canonicalDataReady = data !== null
    const liveSnapshotReady = liveData?.isSnapshotReady() === true
    if (!canonicalDataReady || !liveSnapshotReady) {
      const body: ApiNotReadyResponse = {
        status: 'not-ready',
        dataVersion: data?.dataVersion ?? config.dataVersion,
        canonicalDataReady,
        liveSnapshotReady,
        error: canonicalDataReady
          ? 'Live transit snapshot is not ready'
          : 'Canonical data is not ready',
      }
      response.status(503).json(body)
      return
    }

    const body: ApiReadyResponse = {
      status: 'ready',
      dataVersion: data.dataVersion,
      canonicalDataReady: true,
      liveSnapshotReady: true,
      venueCount: data.counts.venues,
      routeCount: data.counts.routes,
      stopCount: data.counts.stops,
      walkingConnectionCount: data.counts.walkingConnections,
    }
    response.json(body satisfies ApiReadinessResponse)
  })

  app.route('/api/shuttle-arrivals')
    .get(liveDataHandler(liveData, (request) => request.query.stops, (service, query) => service.getShuttleArrivals(query)))
    .all(methodNotAllowed())
  app.route('/api/shuttle-service-windows')
    .get(liveDataHandler(liveData, (request) => request.query.routes, (service, query) => service.getServiceWindows(query)))
    .all(methodNotAllowed())
  app.route('/api/public-bus-arrivals')
    .get(liveDataHandler(liveData, (request) => request.query.stops, (service, query) => service.getPublicBusArrivals(query)))
    .all(methodNotAllowed())

  app.use('/api', (_request, response) => {
    sendError(response, 404, 'API route not found', 'invalid_request')
  })
  app.use(errorHandler())
  return app
}

import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import type { ApiErrorResponse, ApiHealthResponse, ApiReadyResponse } from '@navus/shared'
import type { BackendConfig } from './config.ts'
import type { BackendData } from './data.ts'

const BODY_LIMIT = '32kb'
const MAX_URL_LENGTH = 2048
const ALLOWED_METHODS = 'GET, HEAD, POST, OPTIONS'
const ALLOWED_HEADERS = new Set(['accept', 'content-type'])

function sendError(response: express.Response, status: number, error: string): void {
  const body: ApiErrorResponse = { error }
  response.status(status).json(body)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

export function createApp(
  config: Pick<BackendConfig, 'corsOrigins' | 'dataVersion'>,
  data: BackendData | null,
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
      sendError(response, 414, 'Request URL is too long')
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
    if (!data) {
      sendError(response, 503, 'Canonical data is not ready')
      return
    }

    const body: ApiReadyResponse = {
      status: 'ready',
      dataVersion: data.dataVersion,
      venueCount: data.counts.venues,
      routeCount: data.counts.routes,
      stopCount: data.counts.stops,
      walkingConnectionCount: data.counts.walkingConnections,
    }
    response.json(body)
  })

  app.use('/api', (_request, response) => {
    sendError(response, 404, 'API route not found')
  })
  app.use(errorHandler())
  return app
}

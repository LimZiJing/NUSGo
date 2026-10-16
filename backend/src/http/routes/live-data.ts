import type { Express, Request, RequestHandler } from 'express'
import { LiveDataRequestError, type BackendLiveData } from '../../live-data/runtime.ts'
import { sendApiError } from '../error-response.ts'

function queryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function liveDataHandler(
  liveData: BackendLiveData | null,
  selectQuery: (request: Request) => unknown,
  load: (liveData: BackendLiveData, query: string | null) => unknown | Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    if (!liveData) {
      sendApiError(response, 503, 'Live transit data is not ready', 'not_ready')
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
      .then(() => load(liveData, queryValue(selectQuery(request))))
      .then((body) => {
        if (!controller.signal.aborted && !response.writableEnded) response.json(body)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        if (error instanceof LiveDataRequestError) {
          sendApiError(response, error.status, error.message, error.code)
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
    sendApiError(response, 405, 'Only GET is supported', 'invalid_request')
  }
}

export function registerLiveDataRoutes(app: Express, liveData: BackendLiveData | null): void {
  app.route('/api/shuttle-arrivals')
    .get(liveDataHandler(liveData, (request) => request.query.stops, (service, query) => service.getShuttleArrivals(query)))
    .all(methodNotAllowed())
  app.route('/api/shuttle-service-windows')
    .get(liveDataHandler(liveData, (request) => request.query.routes, (service, query) => service.getServiceWindows(query)))
    .all(methodNotAllowed())
  app.route('/api/public-bus-arrivals')
    .get(liveDataHandler(liveData, (request) => request.query.stops, (service, query) => service.getPublicBusArrivals(query)))
    .all(methodNotAllowed())
}

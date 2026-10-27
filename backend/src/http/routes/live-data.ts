import type { Express, Request, RequestHandler } from 'express'
import type { BackendData } from '../../canonical-data.ts'
import { LiveDataRequestError, type BackendLiveData } from '../../live-data/runtime.ts'
import { sendApiError } from '../error-response.ts'
import { InvalidSelectionError, parseBusRouteSelection, parseBusStopSelection } from '../validation/stop-selection.ts'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function liveDataHandler<Selection>(
  liveData: BackendLiveData | null,
  selectRequest: (request: Request, liveData: BackendLiveData) => Selection,
  load: (liveData: BackendLiveData, selection: Selection) => unknown | Promise<unknown>,
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
      .then(() => load(liveData, selectRequest(request, liveData)))
      .then((body) => {
        if (!controller.signal.aborted && !response.writableEnded) response.json(body)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        if (error instanceof InvalidSelectionError) {
          sendApiError(response, 400, error.message, 'invalid_request')
          return
        }
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

export function registerLiveDataRoutes(
  app: Express,
  data: BackendData | null,
  liveData: BackendLiveData | null,
): void {
  const canonicalStopIds = data?.network.stops.map(({ id }) => id) ?? []
  const canonicalRouteIds = data?.network.routes.map(({ id }) => id) ?? []

  app.route('/api/shuttle-arrivals')
    .get(liveDataHandler(
      liveData,
      (request) => parseBusStopSelection(request.query.stops, canonicalStopIds, {
        queryLabel: 'stops',
        itemLabel: 'requested stop',
        unknownStop: (stopId) => 'Unknown canonical bus stop: ' + stopId,
      }),
      (service, stopIds) => service.getBusArrivals(stopIds),
    ))
    .all(methodNotAllowed())
  app.route('/api/shuttle-service-windows')
    .get(liveDataHandler(
      liveData,
      (request) => parseBusRouteSelection(request.query.routes, canonicalRouteIds),
      (service, routeIds) => service.getServiceWindows(routeIds),
    ))
    .all(methodNotAllowed())
  app.route('/api/shuttle-vehicles')
    .get(liveDataHandler(
      liveData,
      (request) => parseBusRouteSelection(request.query.routes, canonicalRouteIds),
      (service, routeIds) => service.getVehicles(routeIds),
    ))
    .all(methodNotAllowed())
  app.route('/api/public-bus-arrivals')
    .get(liveDataHandler(
      liveData,
      (request, service) => parseBusStopSelection(request.query.stops, service.getPublicBusStopIds(), {
        queryLabel: 'public bus stops',
        itemLabel: 'public bus stop',
        unknownStop: (stopId) => 'Unknown mapped public bus stop: ' + stopId,
      }),
      (service, stopIds) => service.getPublicBusArrivals(stopIds),
    ))
    .all(methodNotAllowed())
}

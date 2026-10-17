import type { Express, RequestHandler } from 'express'
import type { ApiJourneyPlanningRequest, ApiJourneyPlanningResponse } from '@navus/shared/routing/path'
import type { BackendConfig } from '../../config.ts'
import { LiveDataRequestError } from '../../live-data/runtime.ts'
import { InvalidJourneyEndpointError, type PathfindingService } from '../../pathfinding/service.ts'
import { ValhallaRouteError } from '../../pathfinding/walking/valhalla-walking-client.ts'
import { sendApiError } from '../error-response.ts'
import { InvalidJourneyRequestError, parseJourneyPlanningRequest } from './journey-request.ts'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function journeyHandler(
  environment: BackendConfig['environment'],
  planner: PathfindingService | null,
): RequestHandler {
  return (request, response, next) => {
    if (!planner) {
      sendApiError(response, 503, 'Journey planning is not ready', 'not_ready')
      return
    }

    let planningRequest: ApiJourneyPlanningRequest
    try {
      planningRequest = parseJourneyPlanningRequest(request.body, environment)
    } catch (error: unknown) {
      if (error instanceof InvalidJourneyRequestError) {
        sendApiError(response, 400, error.message, 'invalid_request')
        return
      }
      next(error)
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
      .then(() => planner.plan(planningRequest, controller.signal))
      .then((result: ApiJourneyPlanningResponse) => {
        if (!controller.signal.aborted && !response.writableEnded) response.json(result)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        if (error instanceof InvalidJourneyEndpointError) {
          sendApiError(response, 400, error.message, 'invalid_request')
          return
        }
        if (error instanceof LiveDataRequestError) {
          sendApiError(response, error.status, error.message, error.code)
          return
        }
        if (error instanceof ValhallaRouteError) {
          sendApiError(response, 503, 'Walking route provider is unavailable', 'provider_unavailable')
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
    response.setHeader('Allow', 'POST, OPTIONS')
    sendApiError(response, 405, 'Only POST is supported', 'invalid_request')
  }
}

export { InvalidJourneyRequestError, parseJourneyPlanningRequest }

export function registerJourneyRoutes(
  app: Express,
  environment: BackendConfig['environment'],
  planner: PathfindingService | null,
): void {
  app.route('/api/journeys')
    .post(journeyHandler(environment, planner))
    .all(methodNotAllowed())
}

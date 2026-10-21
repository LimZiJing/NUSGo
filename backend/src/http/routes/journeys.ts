import type { Express, RequestHandler } from 'express'
import type { ApiJourneyPlanningRequest, ApiJourneyPlanningResponse } from '@navus/shared/routing/path'
import type { BackendConfig } from '../../config.ts'
import { LiveDataRequestError } from '../../live-data/runtime.ts'
import { InvalidJourneyEndpointError, type PathfindingService } from '../../pathfinding/service.ts'
import { ValhallaRouteError } from '../../pathfinding/walking/valhalla-walking-client.ts'
import { sendApiError } from '../error-response.ts'
import { createConcurrencyLimiter } from '../concurrency-limiter.ts'
import { createClientRateLimiter } from '../rate-limiter.ts'
import { InvalidJourneyRequestError, parseJourneyPlanningRequest } from './journey-request.ts'

type JourneyRouteLimits = Pick<
  BackendConfig,
  | 'apiRateLimitWindowMs'
  | 'journeyMaxConcurrentRequests'
  | 'journeyRateLimitMaxRequests'
  | 'journeyRequestTimeoutMs'
>

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function createAbortError(): Error {
  const error = new Error('The Journey request was aborted')
  error.name = 'AbortError'
  return error
}

function journeyHandler(
  environment: BackendConfig['environment'],
  planner: PathfindingService | null,
  requestTimeoutMs: number,
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
    let timedOut = false
    let rejectCancellation: (error: Error) => void = () => {}
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject
    })
    const abortWhenDisconnected = () => {
      if (!response.writableEnded) {
        controller.abort()
        rejectCancellation(createAbortError())
      }
    }
    const onRequestAborted = () => {
      controller.abort()
      rejectCancellation(createAbortError())
    }
    request.once('aborted', onRequestAborted)
    response.once('close', abortWhenDisconnected)
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
      const error = new Error('Journey planning request timed out')
      error.name = 'TimeoutError'
      rejectCancellation(error)
    }, requestTimeoutMs)

    void Promise.race([
      Promise.resolve().then(() => planner.plan(planningRequest, controller.signal)),
      cancellation,
    ])
      .then((result: ApiJourneyPlanningResponse) => {
        if (!controller.signal.aborted && !response.writableEnded) response.json(result)
      })
      .catch((error: unknown) => {
        if (timedOut) {
          if (!response.writableEnded) {
            sendApiError(response, 504, 'Journey planning timed out', 'provider_unavailable')
          }
          return
        }
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
        clearTimeout(timeout)
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
  limits: JourneyRouteLimits,
): void {
  app.route('/api/journeys')
    .post(
      createClientRateLimiter({
        windowMs: limits.apiRateLimitWindowMs,
        maxRequests: limits.journeyRateLimitMaxRequests,
        message: 'Journey planning rate limit reached',
      }),
      createConcurrencyLimiter(limits.journeyMaxConcurrentRequests, 'Journey planning is at capacity'),
      journeyHandler(environment, planner, limits.journeyRequestTimeoutMs),
    )
    .all(methodNotAllowed())
}

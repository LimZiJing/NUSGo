import type { Express, RequestHandler, Response } from 'express'
import {
  PUSH_SUBSCRIPTION_BODY_MAX_BYTES,
  parsePushReminderRegistration,
  parsePushReminderRequest,
  type PushReminderResponse,
} from '@nusgo/shared'
import type { PushConfig } from '../../config.ts'
import type { AlightReminderPublisher } from '../../push/alight-reminders.ts'
import type { AlightReminderRegistry } from '../../push/reminder-registry.ts'
import { sendApiError } from '../error-response.ts'
import { createClientRateLimiter } from '../rate-limiter.ts'

export interface ReminderRouteDependencies {
  /** Null when the deployment has no VAPID keys; the routes then report push as unavailable. */
  readonly push: PushConfig | null
  readonly registry: AlightReminderRegistry
  /** Null when this process did not compose a reminder publisher. */
  readonly reminders: AlightReminderPublisher | null
  readonly apiRateLimitWindowMs: number
  /** The canonical stop and route ids a reminder may name, so a watch cannot target nothing. */
  readonly canonicalStopIds: ReadonlySet<string>
  readonly canonicalRouteIds: ReadonlySet<string>
}

function methodNotAllowed(allowed: string): RequestHandler {
  return (_request, response) => {
    response.setHeader('Allow', allowed)
    sendApiError(response, 405, 'Only ' + (allowed.split(',')[0]?.trim() ?? 'GET') + ' is supported', 'invalid_request')
  }
}

function sendNotConfigured(response: Response): void {
  sendApiError(response, 503, 'Web push is not configured', 'not_ready')
}

function exceedsBodyLimit(body: unknown): boolean {
  const serialized = body === undefined ? '' : JSON.stringify(body)
  return Buffer.byteLength(serialized, 'utf8') > PUSH_SUBSCRIPTION_BODY_MAX_BYTES
}

/**
 * Registration for the alight-reminders topic.
 *
 * A registration is the same endpoint and keys as any push subscription plus one stop and route
 * id and the lead time the rider chose. Only those values are stored: no identity, no device
 * fingerprint, no GPS position and no saved journey. The creation time and expiry are assigned
 * here by the registry from the server clock, never by the client, so a device cannot extend its
 * own watch. Both routes reuse the push routes' per-client rate limiter and the shared validators,
 * so a reminder cannot arrive in a shape the evaluator would not understand.
 *
 * The `201` body echoes the stored lead time and expiry so the app can say when the reminder
 * lapses, using the same trusted timestamps the evaluator enforces.
 */
export function registerReminderRoutes(app: Express, dependencies: ReminderRouteDependencies): void {
  const { push, registry, reminders, canonicalStopIds, canonicalRouteIds } = dependencies
  // The same separate budget the push routes use, so reminder writes cannot spend the general
  // API allowance that live arrivals and Journey planning need.
  const rateLimiter = createClientRateLimiter({
    windowMs: dependencies.apiRateLimitWindowMs,
    maxRequests: push?.subscriptionRateLimitMaxRequests ?? 10,
    message: 'Push subscription rate limit reached',
  })

  app.route('/api/push/reminders')
    .post(
      rateLimiter,
      (request, response) => {
        if (!push) {
          sendNotConfigured(response)
          return
        }
        if (exceedsBodyLimit(request.body)) {
          sendApiError(response, 413, 'Push reminder body is too large', 'invalid_request')
          return
        }
        const registration = parsePushReminderRegistration(request.body)
        if (!registration) {
          sendApiError(response, 400, 'Push reminder is invalid', 'invalid_request')
          return
        }
        // Rejecting unknown ids here keeps the evaluator from holding watches it can never match.
        if (
          !canonicalStopIds.has(registration.watch.stopId) ||
          !canonicalRouteIds.has(registration.watch.routeId)
        ) {
          sendApiError(response, 400, 'Push reminder names an unknown stop or route', 'invalid_request')
          return
        }
        const record = registry.upsert(registration)
        // A new watch starts with a fresh hourly window rather than inheriting an old one.
        reminders?.forgetSubscription(registration.endpoint)
        response.status(201).json({
          topic: record.topic,
          leadTimeSeconds: record.leadTimeSeconds,
          expiresAt: new Date(record.expiresAtMs).toISOString(),
        } satisfies PushReminderResponse)
      },
    )
    .all(methodNotAllowed('POST, OPTIONS'))

  app.route('/api/push/reminders/remove')
    .post(
      rateLimiter,
      (request, response) => {
        if (!push) {
          sendNotConfigured(response)
          return
        }
        const endpoint = parsePushReminderRequest(request.body)
        if (!endpoint) {
          sendApiError(response, 400, 'Push reminder removal is invalid', 'invalid_request')
          return
        }
        // Removing an unknown endpoint still succeeds: the caller's intent is "stop reminding me".
        registry.remove(endpoint)
        reminders?.forgetSubscription(endpoint)
        response.status(204).end()
      },
    )
    .all(methodNotAllowed('POST, OPTIONS'))
}

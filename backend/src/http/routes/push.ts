import type { Express, RequestHandler, Response } from 'express'
import {
  PUSH_SUBSCRIPTION_BODY_MAX_BYTES,
  parsePushSubscriptionRegistration,
  parsePushSubscriptionUnsubscribeRequest,
  type PushPublicKeyResponse,
  type PushSubscriptionResponse,
} from '@nusgo/shared'
import type { PushConfig } from '../../config.ts'
import type { NotificationCap } from '../../push/notification-cap.ts'
import type { PushSubscriptionStore } from '../../push/subscription-store.ts'
import { sendApiError } from '../error-response.ts'
import { createClientRateLimiter } from '../rate-limiter.ts'

export interface PushRouteDependencies {
  /** Null when the deployment has no VAPID keys; the routes then report push as unavailable. */
  readonly push: PushConfig | null
  readonly store: PushSubscriptionStore
  readonly cap: NotificationCap
  readonly apiRateLimitWindowMs: number
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
 * Subscription management for the service-updates topic.
 *
 * Only the endpoint, its keys, and the chosen topic are stored: the server never receives a
 * user identity, a device fingerprint, or a saved stop. All input is validated here, at the
 * boundary, against the shared contract before it reaches the store.
 */
export function registerPushRoutes(app: Express, dependencies: PushRouteDependencies): void {
  const { push, store, cap } = dependencies
  // This budget is per client address and separate from the general API budget, so a subscribe
  // retry loop cannot consume the allowance that live arrivals and Journey planning need.
  const rateLimiter = createClientRateLimiter({
    windowMs: dependencies.apiRateLimitWindowMs,
    maxRequests: push?.subscriptionRateLimitMaxRequests ?? 10,
    message: 'Push subscription rate limit reached',
  })

  app.route('/api/push/public-key')
    .get((_request, response) => {
      response.json({ publicKey: push?.publicKey ?? null } satisfies PushPublicKeyResponse)
    })
    .all(methodNotAllowed('GET, HEAD, OPTIONS'))

  app.route('/api/push/subscriptions')
    .post(
      rateLimiter,
      (request, response) => {
        if (!push) {
          sendNotConfigured(response)
          return
        }
        if (exceedsBodyLimit(request.body)) {
          sendApiError(response, 413, 'Push subscription body is too large', 'invalid_request')
          return
        }
        const registration = parsePushSubscriptionRegistration(request.body)
        if (!registration) {
          sendApiError(response, 400, 'Push subscription is invalid', 'invalid_request')
          return
        }
        if (!store.add(registration)) {
          sendApiError(response, 503, 'Notification registration is at capacity. Try again later.', 'not_ready')
          return
        }
        // Re-registering resets this endpoint's hourly window rather than inheriting an old one.
        cap.reset(registration.endpoint)
        response.status(201).json({ topic: registration.topic } satisfies PushSubscriptionResponse)
      },
    )
    .all(methodNotAllowed('POST, OPTIONS'))

  app.route('/api/push/subscriptions/remove')
    .post(
      rateLimiter,
      (request, response) => {
        if (!push) {
          sendNotConfigured(response)
          return
        }
        const endpoint = parsePushSubscriptionUnsubscribeRequest(request.body)
        if (!endpoint) {
          sendApiError(response, 400, 'Push subscription removal is invalid', 'invalid_request')
          return
        }
        // Removing an unknown endpoint still succeeds: the caller's intent is "not subscribed".
        store.remove(endpoint)
        cap.reset(endpoint)
        response.status(204).end()
      },
    )
    .all(methodNotAllowed('POST, OPTIONS'))
}


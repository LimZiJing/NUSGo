import express, { type Express } from 'express'
import type { BackendConfig } from '../config.ts'
import type { BackendData } from '../canonical-data.ts'
import type { BackendLiveData } from '../live-data/runtime.ts'
import { registerHealthRoutes } from './routes/health.ts'
import { registerLiveDataRoutes } from './routes/live-data.ts'
import { registerJourneyRoutes } from './routes/journeys.ts'
import { registerPushRoutes } from './routes/push.ts'
import { registerReminderRoutes } from './routes/reminders.ts'
import type { PushSubscriptionStore } from '../push/subscription-store.ts'
import type { AlightReminderRegistry } from '../push/reminder-registry.ts'
import type { AlightReminderPublisher } from '../push/alight-reminders.ts'
import type { NotificationCap } from '../push/notification-cap.ts'
import type { PathfindingService } from '../pathfinding/service.ts'
import { createApiErrorHandler, sendApiError } from './error-response.ts'
import { createCorsMiddleware } from './cors.ts'
import { createClientRateLimiter } from './rate-limiter.ts'

const BODY_LIMIT = '32kb'
const MAX_URL_LENGTH = 2048

type AppConfig = Pick<
  BackendConfig,
  | 'apiRateLimitMaxRequests'
  | 'apiRateLimitWindowMs'
  | 'corsOrigins'
  | 'dataVersion'
  | 'journeyMaxConcurrentRequests'
  | 'journeyRateLimitMaxRequests'
  | 'journeyRequestTimeoutMs'
> & {
  readonly environment?: BackendConfig['environment']
  /** Absent when a caller does not register push routes. */
  readonly push?: BackendConfig['push']
}

/** Push collaborators wired by the process; omitted in tests that do not exercise push routes. */
export interface AppPushDependencies {
  readonly store: PushSubscriptionStore
  readonly cap: NotificationCap
  /** Absent in tests that only exercise the service-updates subscription routes. */
  readonly reminderRegistry?: AlightReminderRegistry
  /** Absent when the process did not compose a reminder publisher. */
  readonly reminderPublisher?: AlightReminderPublisher | null
}

export function createApp(
  config: AppConfig,
  data: BackendData | null,
  liveData: BackendLiveData | null = null,
  planner: PathfindingService | null = null,
  pushDependencies: AppPushDependencies | null = null,
): Express {
  const app = express()
  app.disable('x-powered-by')
  // cloudflared connects over loopback; request-limits trusts its client-IP header only for that local peer.
  app.set('trust proxy', 'loopback')
  app.use('/api', (_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  // Count requests before CORS and body parsing; CORS does not stop direct API callers.
  app.use('/api', createClientRateLimiter({
    windowMs: config.apiRateLimitWindowMs,
    maxRequests: config.apiRateLimitMaxRequests,
    message: 'API request rate limit reached',
  }))
  app.use('/api', createCorsMiddleware(config.corsOrigins))
  app.use('/api', (request, response, next) => {
    if (request.originalUrl.length > MAX_URL_LENGTH) {
      sendApiError(response, 414, 'Request URL is too long', 'invalid_request')
      return
    }
    next()
  })
  app.use('/api', express.json({ limit: BODY_LIMIT, strict: true }))

  registerHealthRoutes(app, config, data, liveData)
  registerLiveDataRoutes(app, data, liveData)
  registerJourneyRoutes(
    app,
    config.environment ?? 'production',
    planner,
    config,
  )
  if (pushDependencies) {
    registerPushRoutes(app, {
      push: config.push ?? null,
      store: pushDependencies.store,
      cap: pushDependencies.cap,
      apiRateLimitWindowMs: config.apiRateLimitWindowMs,
    })
    if (pushDependencies.reminderRegistry) {
      // Reminder ids must be real, so the canonical data this process loaded is the allow-list.
      const canonicalStopIds = new Set(data?.network.stops.map((stop) => stop.id) ?? [])
      const canonicalRouteIds = new Set(data?.network.routes.map((route) => route.id) ?? [])
      registerReminderRoutes(app, {
        push: config.push ?? null,
        registry: pushDependencies.reminderRegistry,
        reminders: pushDependencies.reminderPublisher ?? null,
        apiRateLimitWindowMs: config.apiRateLimitWindowMs,
        canonicalStopIds,
        canonicalRouteIds,
      })
    }
  }

  app.use('/api', (_request, response) => {
    sendApiError(response, 404, 'API route not found', 'invalid_request')
  })
  app.use(createApiErrorHandler())
  return app
}

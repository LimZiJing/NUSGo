import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createApp } from './http/app.ts'
import { loadBackendConfig } from './config.ts'
import { loadCanonicalData } from './canonical-data.ts'
import { createBackendLiveData } from './live-data/runtime.ts'
import { createPathfindingService } from './pathfinding/service.ts'
import { createPushSubscriptionStore } from './push/subscription-store.ts'
import { createNotificationCap } from './push/notification-cap.ts'
import { createServiceUpdatePublisher } from './push/service-update-publisher.ts'
import { createAlightReminderPublisher } from './push/alight-reminders.ts'
import { createAlightReminderRegistry } from './push/reminder-registry.ts'
import { createWebPushSender } from './push/web-push-sender.ts'
import type { BackendConfig } from './config.ts'

export function listenHttpServer(
  app: ReturnType<typeof createApp>,
  host: string,
  port: number,
): Promise<Server> {
  return new Promise((resolveServer, reject) => {
    const server = createServer(app)
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      resolveServer(server)
    })
  })
}

export function closeHttpServer(server: Server, timeoutMs = 10_000): Promise<void> {
  if (!server.listening) return Promise.resolve()

  return new Promise((resolveClose, reject) => {
    const timeout = setTimeout(() => server.closeAllConnections(), timeoutMs)
    timeout.unref()
    server.close((error) => {
      clearTimeout(timeout)
      if (error) reject(error)
      else resolveClose()
    })
  })
}

async function startBackend(): Promise<void> {
  const config: BackendConfig = loadBackendConfig()
  const data = await loadCanonicalData(config.dataDirectory, config.dataVersion)
  const pushStore = createPushSubscriptionStore()
  // One cap instance is shared by the HTTP routes and both topic publishers, so unsubscribing or
  // re-registering resets the same window that limits delivery and two topics never double-spend
  // one endpoint's hourly allowance.
  const pushCap = createNotificationCap({ maxPerHour: config.push?.notificationsPerHourCap ?? 1 })
  const reminderRegistry = createAlightReminderRegistry()
  const stopNameFor = (stopId: string): string | null =>
    data.network.stops.find(({ id }) => id === stopId)?.longName ?? null
  const pushPublisher = config.push
    ? createServiceUpdatePublisher({
      store: pushStore,
      cap: pushCap,
      sendNotification: createWebPushSender(config.push).sendNotification,
      stopName: stopNameFor,
    })
    : null
  // Reminders share the VAPID sender and the hourly cap, but keep their own registry and topic:
  // an endpoint's allowance is spent once across both topics, not once per publisher.
  const reminderPublisher = config.push
    ? createAlightReminderPublisher({
      registry: reminderRegistry,
      cap: pushCap,
      sendNotification: createWebPushSender(config.push).sendNotification,
      stopName: stopNameFor,
    })
    : null
  const liveData = await createBackendLiveData(config, data, {
    onArrivalSnapshotPublished: (snapshot) => {
      // Both publishers read the snapshot this refresh already produced, so neither adds an
      // upstream request. Delivery is fire-and-forget: a slow push service must not delay the
      // next refresh.
      void pushPublisher?.publish(snapshot).catch((error: unknown) => {
        console.error('NUSGo push notification failed.', error instanceof Error ? error.name : typeof error)
      })
      void reminderPublisher?.publish(snapshot).catch((error: unknown) => {
        console.error('NUSGo alight reminder failed.', error instanceof Error ? error.name : typeof error)
      })
    },
  })
  if (reminderPublisher) {
    // Service hours are only cached for routes someone asked about, and a reminder check must not
    // fetch them. Reading that existing cache is what makes "is the service running" free.
    reminderPublisher.setServiceStatus((routeId, atMs) => liveData.getShuttleServiceStatus(routeId, atMs))
  }
  const pathfinding = createPathfindingService(data, liveData, config)
  const server = await listenHttpServer(
    createApp(config, data, liveData, pathfinding, {
      store: pushStore,
      cap: pushCap,
      reminderRegistry,
      reminderPublisher,
    }),
    config.host,
    config.port,
  )
  liveData.start()
  console.info('NUSGo Express API is listening.', {
    host: config.host,
    port: config.port,
    dataVersion: data.dataVersion,
  })

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`NUSGo Express API received ${signal}; closing gracefully.`)
    void Promise.all([closeHttpServer(server), liveData.stop()]).catch((error: unknown) => {
      console.error('NUSGo Express API shutdown failed.', error instanceof Error ? error.name : typeof error)
      process.exitCode = 1
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

const entryPath = process.argv[1]
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  void startBackend().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown startup error'
    console.error('NUSGo Express API failed to start.', message)
    process.exitCode = 1
  })
}

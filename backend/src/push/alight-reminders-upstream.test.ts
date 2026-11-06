import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, describe, it } from 'node:test'
import { generateShuttleTimingData, validateTransitMapData } from '@nusgo/shared'
import { loadBackendConfig } from '../config.ts'
import { validateCanonicalData, type BackendData } from '../canonical-data.ts'
import { createBackendLiveData } from '../live-data/runtime.ts'
import { createAlightReminderPublisher } from '../push/alight-reminders.ts'
import { createAlightReminderRegistry } from '../push/reminder-registry.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDataDirectory = resolve(repositoryRoot, 'frontend/public/data')
const fixedNow = Date.parse('2026-10-15T03:00:00Z')
let backendData: BackendData

async function readJson(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(sourceDataDirectory, filename), 'utf8')) as unknown
}

before(async () => {
  const [venues, buildings, network, routeGeometry, walkingStopGraph] = await Promise.all([
    readJson('venues.json'),
    readJson('buildings.json'),
    readJson('shuttle-network.json'),
    readJson('shuttle-routes.geojson'),
    readJson('walking-stop-graph.json'),
  ])
  const transit = validateTransitMapData(network, routeGeometry)
  backendData = validateCanonicalData({
    venues,
    buildings,
    network,
    routeGeometry,
    walkingStopGraph,
    shuttleTiming: generateShuttleTimingData(
      transit.network,
      transit.geometry,
      transit.network.metadata.verifiedAt,
    ),
  }, 'development')
})

function createConfig() {
  return loadBackendConfig({
    NODE_ENV: 'test',
    NUSGO_DATA_DIR: sourceDataDirectory,
    NUS_BUS_PROXY_BASE_URL: 'https://bus-proxy.nus.example',
    NUS_ACCESS_TOKEN_URL: 'https://auth.nus.example/token',
    NUS_X_HTD_API: 'test-htd-api',
    NUS_X_APP_API: 'test-app-api',
    NUS_X_API_KEY: 'test-api-key',
    NUS_UNIVUS_JWT: 'test-token',
    NUS_USER_ID: 'test-user',
    LIVE_DATA_MAX_CONCURRENCY: '3',
    LIVE_DATA_RETRY_ATTEMPTS: '0',
  }, repositoryRoot)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Counts every upstream request the live-data layer makes, by endpoint. */
function countingFetcher(counts: { shuttleService: number }) {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/shuttle-service')) {
      counts.shuttleService += 1
      return jsonResponse({
        data: [{ routeId: 'D1', nextArrivalSeconds: 90, upcomingArrivalSeconds: [90, 480] }],
      })
    }
    if (url.endsWith('/active-bus')) {
      return jsonResponse({ data: { ActiveBusCount: '0', activebus: [] } })
    }
    throw new Error('Unexpected upstream request: ' + url)
  }
  return fetcher
}

async function waitForSnapshot(liveData: Awaited<ReturnType<typeof createBackendLiveData>>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!liveData.isSnapshotReady() && Date.now() < deadline) {
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5))
  }
  assert.equal(liveData.isSnapshotReady(), true, 'the initial shuttle refresh should publish a snapshot')
}

describe('alight reminders and upstream call volume', () => {
  it('evaluates reminders from the published snapshot without adding a provider request', async () => {
    const config = createConfig()
    const stop = backendData.network.stops[0]
    assert.ok(stop)
    const counts = { shuttleService: 0 }
    const registry = createAlightReminderRegistry()
    const sent: string[] = []
    const publisher = createAlightReminderPublisher({
      registry,
      push: {
        publicKey: 'BPublicKeyValue',
        privateKey: 'PrivateKeyValue',
        subject: 'mailto:test@example.com',
        subscriptionRateLimitMaxRequests: 10,
        notificationsPerHourCap: 4,
      },
      stopName: () => stop.longName,
      sendNotification: async (_subscription, payload) => {
        sent.push(payload)
        return { statusCode: 201 }
      },
      now: () => fixedNow,
    })

    // The watch targets the stop and route the fake provider reports.
    registry.upsert({
      endpoint: 'https://push.example.com/send/watch',
      keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
      topic: 'alight-reminders',
      watch: { stopId: stop.id, routeId: 'D1' },
    })

    const liveData = await createBackendLiveData(config, backendData, {
      fetcher: countingFetcher(counts),
      now: () => fixedNow,
      ltaMappings: [],
      // Exactly the seam the server uses: the reminder publisher runs from the same hook.
      onArrivalSnapshotPublished: (snapshot) => { void publisher.publish(snapshot) },
    })

    try {
      liveData.start()
      await waitForSnapshot(liveData)
      const afterFirstRefresh = counts.shuttleService
      // Every canonical stop is still polled exactly once, whatever reminders exist.
      assert.equal(afterFirstRefresh, backendData.network.stops.length)

      await liveData.stop()
      // Give any in-flight reminder delivery a chance to run before checking the count.
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, 20))
      assert.equal(counts.shuttleService, afterFirstRefresh)
      // The reminder really was evaluated, so the assertion above is not vacuous.
      assert.equal(sent.length, 1)
      assert.equal(JSON.parse(sent[0] ?? '{}').topic, 'alight-reminders')
    } finally {
      await liveData.stop()
    }
  })

  it('reads service status only from cached service hours, never fetching them', () => {
    const liveDataStatus = createBackendLiveData(createConfig(), backendData, {
      fetcher: async (input) => {
        throw new Error('Unexpected upstream request: ' + String(input))
      },
      now: () => fixedNow,
      ltaMappings: [],
    })

    return liveDataStatus.then(async (liveData) => {
      try {
        // Nothing has asked for D1's service hours, so the answer is unknown rather than a fetch.
        assert.equal(liveData.getShuttleServiceStatus('D1'), 'unknown')
      } finally {
        await liveData.stop()
      }
    })
  })
})

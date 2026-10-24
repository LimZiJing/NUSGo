import type { Express } from 'express'
import type {
  ApiHealthResponse,
  ApiNotReadyResponse,
  ApiReadinessResponse,
  ApiReadyResponse,
} from '@nusgo/shared'
import type { BackendConfig } from '../../config.ts'
import type { BackendData } from '../../canonical-data.ts'
import type { BackendLiveData } from '../../live-data/runtime.ts'

export function registerHealthRoutes(
  app: Express,
  config: Pick<BackendConfig, 'dataVersion'>,
  data: BackendData | null,
  liveData: BackendLiveData | null,
): void {
  app.get('/api/health', (_request, response) => {
    const body: ApiHealthResponse = { status: 'ok', dataVersion: config.dataVersion }
    response.json(body)
  })
  app.get('/api/ready', (_request, response) => {
    const canonicalDataReady = data !== null
    const liveSnapshotReady = liveData?.isSnapshotReady() === true
    if (!canonicalDataReady || !liveSnapshotReady) {
      const body: ApiNotReadyResponse = {
        status: 'not-ready',
        dataVersion: data?.dataVersion ?? config.dataVersion,
        canonicalDataReady,
        liveSnapshotReady,
        error: canonicalDataReady
          ? 'Live transit snapshot is not ready'
          : 'Canonical data is not ready',
      }
      response.status(503).json(body)
      return
    }

    const body: ApiReadyResponse = {
      status: 'ready',
      dataVersion: data.dataVersion,
      canonicalDataReady: true,
      liveSnapshotReady: true,
      venueCount: data.counts.venues,
      routeCount: data.counts.routes,
      stopCount: data.counts.stops,
      walkingConnectionCount: data.counts.walkingConnections,
    }
    response.json(body satisfies ApiReadinessResponse)
  })
}

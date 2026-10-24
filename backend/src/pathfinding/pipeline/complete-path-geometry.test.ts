import { describe, expect, it, vi } from 'vitest'
import type { Path, ScoredPathCandidate, TripEndpoint } from '@navus/shared/routing/path'
import { getTripEndpointKey } from '../endpoints.ts'
import type { PathCandidateSearchResult } from '../search/search-path-candidates.ts'
import type { WalkingRouteEngine } from '../walking/walking-contracts.ts'
import { completePathGeometry } from './complete-path-geometry.ts'

const origin: TripEndpoint = {
  kind: 'current-location',
  coordinate: { longitude: 103, latitude: 1 },
}
const destination: TripEndpoint = { kind: 'venue', id: 'DESTINATION' }

function candidate(candidateKey: string, legs: Path['legs']): ScoredPathCandidate {
  const path: Path = {
    origin,
    destination,
    legs,
    totalDurationSeconds: 100,
    totalDistanceMeters: 100,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
  }
  return { candidateKey, path, adjustedDurationSeconds: 100, score: 1 }
}

function shuttleLeg(): Path['legs'][number] {
  return {
    mode: 'shuttle',
    from: origin,
    to: destination,
    routeId: 'A1',
    boardingStopId: 'STOP-A',
    alightingStopId: 'STOP-B',
    waitingSeconds: 0,
    rideSeconds: 100,
    durationSeconds: 100,
    distanceMeters: 100,
    geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
  }
}

function search(rankedCandidates: readonly ScoredPathCandidate[]): PathCandidateSearchResult {
  return {
    rankedCandidates,
    status: 'complete',
    expandedPathCount: rankedCandidates.length,
    indexBuildDurationMs: 0,
    candidateResolutionDurationMs: 0,
    candidateEnumerationStepCount: 0,
    searchDurationMs: 0,
    searchYieldWaitMs: 0,
    searchCpuMs: 0,
    maxSearchChunkDurationMs: 0,
    geometrySliceCount: 0,
    geometrySliceDurationMs: 0,
  }
}

describe('completePathGeometry', () => {
  it('keeps completed candidates bounded when a later candidate hits the geometry deadline', async () => {
    vi.useFakeTimers()
    let monotonicTime = 0
    let markRouteStarted = (): void => {}
    const routeStarted = new Promise<void>((resolve) => { markRouteStarted = resolve })
    let routeSignal: AbortSignal | undefined
    const routeEngine: WalkingRouteEngine = {
      matrixWalking: vi.fn(async () => []),
      routeWalking: vi.fn<WalkingRouteEngine['routeWalking']>((_request, signal) => new Promise((_resolve, reject) => {
        routeSignal = signal
        markRouteStarted()
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })),
    }
    const caller = new AbortController()
    const walkingLeg: Path['legs'][number] = {
      mode: 'walking',
      from: origin,
      to: destination,
      durationSeconds: 100,
      distanceMeters: 100,
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
    }
    const pending = completePathGeometry(routeEngine, search([
      candidate('complete-bus', [shuttleLeg()]),
      candidate('pending-bus', [walkingLeg, shuttleLeg()]),
    ]), [
      { key: getTripEndpointKey(origin), endpoint: origin, coordinate: origin.coordinate },
      { key: getTripEndpointKey(destination), endpoint: destination, coordinate: { longitude: 103.01, latitude: 1.01 } },
    ], caller.signal, 350, () => monotonicTime)
    const outcome = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )

    try {
      await routeStarted
      await vi.advanceTimersByTimeAsync(0)
      monotonicTime = 350
      await vi.advanceTimersByTimeAsync(350)
      const settled = await outcome
      if ('error' in settled) throw settled.error
      const result = settled.value

      expect(result?.searchStatus).toBe('budget-exceeded')
      expect(result?.candidates.map(({ candidateKey }) => candidateKey)).toEqual(['complete-bus'])
      expect(result?.candidates[0]?.path.planningQuality).toBe('bounded')
      expect(routeSignal?.aborted).toBe(true)
      expect(caller.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retains a lower-ranked prefetch completed before the deadline when the first candidate stalls', async () => {
    vi.useFakeTimers()
    let monotonicTime = 0
    let markFirstRouteStarted = (): void => {}
    const firstRouteStarted = new Promise<void>((resolve) => { markFirstRouteStarted = resolve })
    let firstRouteSignal: AbortSignal | undefined
    let routeCallCount = 0
    const routeEngine: WalkingRouteEngine = {
      matrixWalking: vi.fn(async () => []),
      routeWalking: vi.fn<WalkingRouteEngine['routeWalking']>((request, signal) => {
        routeCallCount += 1
        if (routeCallCount === 1) {
          firstRouteSignal = signal
          return new Promise((_resolve, reject) => {
            markFirstRouteStarted()
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        }
        return Promise.resolve({
          distanceMeters: 100,
          durationSeconds: 100,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [request.origin.longitude, request.origin.latitude] as const,
              [request.destination.longitude, request.destination.latitude] as const,
            ],
          },
        })
      }),
    }
    const caller = new AbortController()
    const firstWalkingLeg: Path['legs'][number] = {
      mode: 'walking', from: origin, to: destination, durationSeconds: 100, distanceMeters: 100,
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
    }
    const secondOrigin: TripEndpoint = { kind: 'venue', id: 'SECOND_ORIGIN' }
    const secondWalkingLeg: Path['legs'][number] = {
      mode: 'walking', from: secondOrigin, to: destination, durationSeconds: 100, distanceMeters: 100,
      geometry: { type: 'LineString', coordinates: [[103.02, 1], [103.01, 1.01]] },
    }
    const pending = completePathGeometry(routeEngine, search([
      candidate('highest-ranked', [firstWalkingLeg, shuttleLeg()]),
      candidate('prefetched-before-deadline', [secondWalkingLeg, shuttleLeg()]),
    ]), [
      { key: getTripEndpointKey(origin), endpoint: origin, coordinate: origin.coordinate },
      { key: getTripEndpointKey(destination), endpoint: destination, coordinate: { longitude: 103.01, latitude: 1.01 } },
      { key: getTripEndpointKey(secondOrigin), endpoint: secondOrigin, coordinate: { longitude: 103.02, latitude: 1 } },
    ], caller.signal, 350, () => monotonicTime)
    const outcome = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )

    try {
      await firstRouteStarted
      await vi.advanceTimersByTimeAsync(0)
      expect(routeCallCount).toBe(2)
      monotonicTime = 350
      await vi.advanceTimersByTimeAsync(350)
      const settled = await outcome
      if ('error' in settled) throw settled.error
      const result = settled.value

      expect(result?.searchStatus).toBe('budget-exceeded')
      expect(result?.candidates.map(({ candidateKey }) => candidateKey)).toEqual(['prefetched-before-deadline'])
      expect(result?.candidates[0]?.path.planningQuality).toBe('bounded')
      expect(firstRouteSignal?.aborted).toBe(true)
      expect(caller.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects geometry that settles after the deadline before its timer callback runs', async () => {
    let monotonicTime = 0
    const routeEngine: WalkingRouteEngine = {
      matrixWalking: vi.fn(async () => []),
      routeWalking: vi.fn(async (request) => {
        await Promise.resolve()
        monotonicTime = 350
        return {
          distanceMeters: 100,
          durationSeconds: 100,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [request.origin.longitude, request.origin.latitude] as const,
              [request.destination.longitude, request.destination.latitude] as const,
            ],
          },
        }
      }),
    }
    const walkingCandidate = candidate('late-walk', [{
      mode: 'walking', from: origin, to: destination, durationSeconds: 100, distanceMeters: 100,
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
    }])

    await expect(completePathGeometry(routeEngine, search([walkingCandidate]), [
      { key: getTripEndpointKey(origin), endpoint: origin, coordinate: origin.coordinate },
      { key: getTripEndpointKey(destination), endpoint: destination, coordinate: { longitude: 103.01, latitude: 1.01 } },
    ], new AbortController().signal, 350, () => monotonicTime))
      .rejects.toMatchObject({ name: 'PathGeometryDeadlineExceededError' })
  })
})

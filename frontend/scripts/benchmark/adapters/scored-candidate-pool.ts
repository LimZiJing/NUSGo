import {
  createJourneyPlanningService,
  NoJourneyAvailableError,
} from '../../../src/app/journey-planning.js'
import { planJourneyWithinBudget } from '../../../src/domain/trip/planner.js'
import type { Journey } from '../../../src/domain/trip/journey.js'
import { createWalkingConnectionProvider } from '../../../src/infrastructure/routing/walking-connections.js'
import type {
  JourneyBenchmarkAdapterFactory,
  JourneyBenchmarkOutcome,
} from '../contract.js'

const JOURNEY_SEARCH_MAX_DURATION_MS = 350
const JOURNEY_SEARCH_MAX_EXPANDED_PATHS = 10_000

function asOutcome(
  journey: Journey | null,
  diagnostics: Readonly<Record<string, number | string | boolean>> = {},
): JourneyBenchmarkOutcome {
  if (!journey) {
    return { kind: 'no-route', reason: 'The Journey service returned no route.', diagnostics }
  }
  return { kind: 'journey', journey, diagnostics }
}

function createAbortError(): Error {
  const error = new Error('The benchmark candidate search was cancelled')
  error.name = 'AbortError'
  return error
}

export const createJourneyBenchmarkAdapter: JourneyBenchmarkAdapterFactory = () => ({
  id: 'scored-candidate-pool',
  label: 'Scored candidate pool with geometry enrichment',

  createSearchRunner({ benchmarkCase }) {
    return async (signal) => {
      const result = await planJourneyWithinBudget(benchmarkCase.searchInput, {
        maxDurationMs: JOURNEY_SEARCH_MAX_DURATION_MS,
        maxExpandedPaths: JOURNEY_SEARCH_MAX_EXPANDED_PATHS,
        shouldCancel: () => signal.aborted,
        yieldEvery: 0,
        now: () => performance.now(),
      })
      if (signal.aborted || result.status === 'cancelled') throw createAbortError()
      return asOutcome(result.journey, {
        planningStatus: result.status,
        expandedPathCount: result.expandedPathCount,
        indexBuildDurationMs: result.indexBuildDurationMs,
        candidateResolutionDurationMs: result.candidateResolutionDurationMs,
        candidateEnumerationStepCount: result.candidateEnumerationStepCount,
        searchDurationMs: result.searchDurationMs,
        searchYieldWaitMs: result.searchYieldWaitMs,
        searchCpuMs: result.searchCpuMs,
        maxSearchChunkDurationMs: result.maxSearchChunkDurationMs,
        geometrySliceCount: result.geometrySliceCount,
        geometrySliceDurationMs: result.geometrySliceDurationMs,
        candidatePoolSize: result.candidates.length,
        busCandidateCount: result.candidates.filter(({ journey }) => (
          journey.legs.some((leg) => leg.mode === 'shuttle')
        )).length,
      })
    }
  },

  createJourneyRunner({ benchmarkCase, venues, transit, walkingGraph, routeEngine, now, createArrivalClient, createServiceHoursClient }) {
    const walkingConnectionProvider = createWalkingConnectionProvider({
      routeEngine,
      loadGraph: async () => walkingGraph,
    })
    const service = createJourneyPlanningService(
      routeEngine,
      createArrivalClient(benchmarkCase),
      createServiceHoursClient?.(benchmarkCase),
      now,
      walkingConnectionProvider,
    )

    return async (signal) => {
      try {
        const result = await service({
          tripRequest: {
            origin: benchmarkCase.origin,
            destination: benchmarkCase.destination,
          },
          venues,
          transit,
          signal,
        })
        return asOutcome(result, result ? {
          planningStatus: result.status,
          expandedPathCount: result.expandedPathCount,
          indexBuildDurationMs: result.indexBuildDurationMs,
          candidateResolutionDurationMs: result.candidateResolutionDurationMs,
          candidateEnumerationStepCount: result.candidateEnumerationStepCount,
          searchDurationMs: result.searchDurationMs,
          searchYieldWaitMs: result.searchYieldWaitMs,
          searchCpuMs: result.searchCpuMs,
          maxSearchChunkDurationMs: result.maxSearchChunkDurationMs,
          geometrySliceCount: result.geometrySliceCount,
          geometrySliceDurationMs: result.geometrySliceDurationMs,
          candidatePoolSize: result.candidates.length,
          busCandidateCount: result.candidates.filter(({ journey }) => (
            journey.legs.some((leg) => leg.mode === 'shuttle')
          )).length,
          geometryCandidateChecks: result.geometryCandidateChecks,
          geometryRouteRequests: result.geometryRouteRequests,
          geometryRouteCacheHits: result.geometryRouteCacheHits,
        } : {})
      } catch (error) {
        if (error instanceof NoJourneyAvailableError) {
          return { kind: 'no-route', reason: error.message }
        }
        throw error
      }
    }
  },
})

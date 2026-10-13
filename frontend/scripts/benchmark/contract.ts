import type { LoadedTransitData } from '../../src/app/contracts/data.js'
import type { WalkingRouteEngine } from '../../src/app/contracts/routing.js'
import type { ShuttleArrivalClient } from '../../src/app/contracts/shuttle-arrivals.js'
import type { ShuttleArrivalSnapshot } from '../../src/domain/transit/arrivals.js'
import type { Path } from '../../src/pathfinding/path.js'
import type { PathSearchInput } from '../../src/pathfinding/search/search-path-candidates.js'
import type { TripEndpoint } from '../../src/domain/trip/types.js'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { WalkingStopGraph } from '@navus/shared/routing/walking-stop-graph'
import type { ShuttleServiceHoursClient } from '../../src/infrastructure/shuttle-service-hours/client.js'
import type { JourneyBenchmarkGroup, JourneyBenchmarkScenario, JourneyBenchmarkTimingProfile } from './manifest.js'

export interface JourneyBenchmarkExpectation {
  readonly outcome: 'journey' | 'no-route'
  readonly shuttleBoardings?: number
  readonly modes?: readonly ('walking' | 'shuttle')[]
  readonly routeIds?: readonly string[]
}

export interface JourneyBenchmarkDurationBounds {
  readonly min?: number
  readonly max?: number
}

export interface JourneyBenchmarkCase {
  readonly id: string
  readonly label: string
  readonly origin: TripEndpoint
  readonly destination: TripEndpoint
  readonly arrivalSeconds: number
  readonly group?: JourneyBenchmarkGroup
  readonly scenario?: JourneyBenchmarkScenario
  readonly timingProfile?: JourneyBenchmarkTimingProfile
  readonly arrivalRouteIds?: readonly string[]
  readonly arrivalSnapshot?: ShuttleArrivalSnapshot
  readonly transit?: LoadedTransitData
  readonly expected: JourneyBenchmarkExpectation
  readonly durationBoundsSeconds?: JourneyBenchmarkDurationBounds
  readonly searchInput: PathSearchInput
}

export type JourneyBenchmarkOutcome =
  | {
    readonly kind: 'journey'
    readonly path: Path
    readonly diagnostics?: Readonly<Record<string, number | string | boolean>>
  }
  | {
    readonly kind: 'no-route'
    readonly reason: string
    readonly diagnostics?: Readonly<Record<string, number | string | boolean>>
  }

export type JourneyBenchmarkRunner = (
  signal: AbortSignal,
) => Promise<JourneyBenchmarkOutcome>

export interface JourneyBenchmarkContext {
  readonly transit: LoadedTransitData
  readonly venues: VenueLocationMap
  readonly walkingGraph: WalkingStopGraph
  readonly routeEngine: WalkingRouteEngine
  readonly now: () => number
  readonly createArrivalClient: (benchmarkCase: JourneyBenchmarkCase) => ShuttleArrivalClient
  readonly createServiceHoursClient?: (benchmarkCase: JourneyBenchmarkCase) => ShuttleServiceHoursClient
  readonly cases: readonly JourneyBenchmarkCase[]
}

export interface JourneyBenchmarkCaseContext extends JourneyBenchmarkContext {
  readonly benchmarkCase: JourneyBenchmarkCase
}

export interface JourneyBenchmarkAdapter {
  readonly id: string
  readonly label: string
  createSearchRunner(context: JourneyBenchmarkCaseContext):
    | JourneyBenchmarkRunner
    | Promise<JourneyBenchmarkRunner>
  createJourneyRunner(context: JourneyBenchmarkCaseContext):
    | JourneyBenchmarkRunner
    | Promise<JourneyBenchmarkRunner>
  dispose?(): void | Promise<void>
}

export type JourneyBenchmarkAdapterFactory = (
  context: JourneyBenchmarkContext,
) => JourneyBenchmarkAdapter | Promise<JourneyBenchmarkAdapter>

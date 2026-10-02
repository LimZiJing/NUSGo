import type { LoadedTransitData } from '../../src/app/contracts/data.js'
import type { WalkingRouteEngine } from '../../src/app/contracts/routing.js'
import type { ShuttleArrivalClient } from '../../src/app/contracts/shuttle-arrivals.js'
import type { Journey } from '../../src/domain/trip/journey.js'
import type { PlanJourneyInput } from '../../src/domain/trip/planner.js'
import type { TripEndpoint } from '../../src/domain/trip/types.js'
import type { VenueLocationMap } from '../../src/domain/venue/types.js'
import type { WalkingStopGraph } from '../../src/infrastructure/routing/walking-stop-graph.js'

export interface JourneyBenchmarkExpectation {
  readonly outcome: 'journey' | 'no-route'
  readonly shuttleBoardings?: number
  readonly modes?: readonly ('walking' | 'shuttle')[]
}

export interface JourneyBenchmarkCase {
  readonly id: string
  readonly label: string
  readonly origin: TripEndpoint
  readonly destination: TripEndpoint
  readonly arrivalSeconds: number
  readonly expected: JourneyBenchmarkExpectation
  readonly searchInput: PlanJourneyInput
}

export type JourneyBenchmarkOutcome =
  | {
    readonly kind: 'journey'
    readonly journey: Journey
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

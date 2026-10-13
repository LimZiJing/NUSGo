import type { Journey } from '../../domain/trip/journey'
import { formatDuration } from '../../domain/trip/duration-format'
import type { TripRequest } from '../../domain/trip/types'
import type { ExploreViewState } from '../../features/explore-view/state'
import type { JourneyState } from '../journey-state'

// One-line text shown on a collapsed mobile sheet so each tab says what it holds.
// Terms follow CONTEXT.md (Nearby, Journey).

interface StopsSummaryInput {
  readonly selectedStop?: { readonly longName: string } | null
  readonly overviewStops?: readonly unknown[]
  readonly overviewLoading?: boolean
  readonly selectedList?: 'nearby' | 'favourites'
}

export function getStopsSheetSummary({
  selectedStop = null,
  overviewStops = [],
  overviewLoading = false,
  selectedList = 'nearby',
}: StopsSummaryInput): string {
  if (selectedStop) return `Stops · ${selectedStop.longName}`
  if (overviewStops.length === 0) {
    if (overviewLoading) return 'Stops · Finding nearby stops'
    return selectedList === 'favourites' ? 'Stops · No favourites yet' : 'Stops · No stops nearby'
  }
  if (selectedList === 'favourites') {
    return `Stops · ${overviewStops.length} ${overviewStops.length === 1 ? 'favourite' : 'favourites'}`
  }
  return `Stops · ${overviewStops.length} nearby`
}

function describeJourney(journey: Journey): string {
  const duration = formatDuration(journey.totalDurationSeconds)
  return journey.legs.every((leg) => leg.mode === 'walking') ? `${duration} walk` : `${duration} Journey`
}

export function getPlanSheetSummary(
  tripRequest: TripRequest,
  journeyState: Pick<JourneyState, 'status' | 'journey'> | undefined,
): string {
  const { origin, destination } = tripRequest
  if (!origin && !destination) return 'Plan trip · Choose origin and destination'
  if (!origin) return 'Plan trip · Choose an origin'
  if (!destination) return 'Plan trip · Choose a destination'

  switch (journeyState?.status) {
    case 'loading': return 'Plan trip · Planning your Journey'
    case 'no-route': return 'Plan trip · No Journey found'
    case 'failed': return 'Plan trip · Could not plan a Journey'
    case 'ready':
      return journeyState.journey
        ? `Plan trip · ${describeJourney(journeyState.journey)}`
        : 'Plan trip · Ready to plan'
    default: return 'Plan trip · Ready to plan'
  }
}

export function getExploreSheetSummary(
  state: Pick<ExploreViewState, 'mode' | 'selectedVenue'>,
  selectedRoute: { readonly id: string, readonly name: string } | null,
): string {
  if (state.mode === 'venue-detail' && state.selectedVenue) return `Explore · ${state.selectedVenue.code}`
  if (state.mode === 'shuttle') {
    return selectedRoute ? `Explore · Route ${selectedRoute.id}` : 'Explore · Shuttle routes'
  }
  return 'Explore · Search venues'
}

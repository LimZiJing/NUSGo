import { describe, expect, it } from 'vitest'
import { createInitialExploreViewState } from '../../features/explore-view/state'
import { createInitialJourneyState } from '../journey-state'
import {
  getExploreSheetSummary,
  getPlanSheetSummary,
  getStopsSheetSummary,
} from './mobile-sheet-summary'
import type { Journey } from '../../domain/trip/journey'

const stop = { longName: 'Kent Ridge MRT' }

function createJourney(modes: readonly ('walking' | 'shuttle')[], totalDurationSeconds: number): Journey {
  return {
    legs: modes.map((mode) => ({ mode })),
    totalDurationSeconds,
  } as unknown as Journey
}

describe('mobile sheet summaries', () => {
  describe('Stops', () => {
    it('summarises the Nearby and Favourites lists by count', () => {
      expect(getStopsSheetSummary({ overviewStops: [{}, {}, {}], selectedList: 'nearby' }))
        .toBe('Stops · 3 nearby')
      expect(getStopsSheetSummary({ overviewStops: [{}], selectedList: 'favourites' }))
        .toBe('Stops · 1 favourite')
      expect(getStopsSheetSummary({ overviewStops: [{}, {}], selectedList: 'favourites' }))
        .toBe('Stops · 2 favourites')
    })

    it('explains empty and loading lists', () => {
      expect(getStopsSheetSummary({ overviewStops: [], selectedList: 'nearby' }))
        .toBe('Stops · No stops nearby')
      expect(getStopsSheetSummary({ overviewStops: [], selectedList: 'favourites' }))
        .toBe('Stops · No favourites yet')
      expect(getStopsSheetSummary({ overviewStops: [], overviewLoading: true, selectedList: 'nearby' }))
        .toBe('Stops · Finding nearby stops')
    })

    it('names the open stop', () => {
      expect(getStopsSheetSummary({ selectedStop: stop, overviewStops: [{}], selectedList: 'nearby' }))
        .toBe('Stops · Kent Ridge MRT')
    })
  })

  describe('Plan', () => {
    const none = { origin: null, destination: null }
    const venue = { kind: 'venue', id: 'COM1' } as const
    const request = { origin: venue, destination: { kind: 'stop', id: 'STOP-A' } } as const

    it('prompts for the missing endpoints', () => {
      const journey = createInitialJourneyState()

      expect(getPlanSheetSummary(none, journey)).toBe('Plan trip · Choose origin and destination')
      expect(getPlanSheetSummary({ origin: venue, destination: null }, journey))
        .toBe('Plan trip · Choose a destination')
      expect(getPlanSheetSummary({ origin: null, destination: venue }, journey))
        .toBe('Plan trip · Choose an origin')
    })

    it('reports planning progress and failures', () => {
      expect(getPlanSheetSummary(request, { ...createInitialJourneyState(), status: 'idle' }))
        .toBe('Plan trip · Ready to plan')
      expect(getPlanSheetSummary(request, { ...createInitialJourneyState(), status: 'loading' }))
        .toBe('Plan trip · Planning your Journey')
      expect(getPlanSheetSummary(request, { ...createInitialJourneyState(), status: 'no-route' }))
        .toBe('Plan trip · No Journey found')
      expect(getPlanSheetSummary(request, { ...createInitialJourneyState(), status: 'failed' }))
        .toBe('Plan trip · Could not plan a Journey')
    })

    it('summarises the planned Journey by duration', () => {
      const ready = (journey: Journey) => ({ ...createInitialJourneyState(), status: 'ready' as const, journey })

      expect(getPlanSheetSummary(request, ready(createJourney(['walking'], 14 * 60 - 20))))
        .toBe('Plan trip · 14 min walk')
      expect(getPlanSheetSummary(request, ready(createJourney(['walking', 'shuttle', 'walking'], 25 * 60))))
        .toBe('Plan trip · 25 min Journey')
    })
  })

  describe('Explore', () => {
    it('describes the current Explore context', () => {
      const initial = createInitialExploreViewState()

      expect(getExploreSheetSummary(initial, null)).toBe('Explore · Search venues')
      expect(getExploreSheetSummary({ ...initial, mode: 'shuttle' }, null))
        .toBe('Explore · Shuttle routes')
      expect(getExploreSheetSummary({ ...initial, mode: 'shuttle' }, { id: 'A1', name: 'A1' }))
        .toBe('Explore · Route A1')
      expect(getExploreSheetSummary({
        ...initial,
        mode: 'venue-detail',
        selectedVenue: { code: 'COM1-0201', venue: { roomName: 'Room' } },
      }, null)).toBe('Explore · COM1-0201')
    })
  })
})

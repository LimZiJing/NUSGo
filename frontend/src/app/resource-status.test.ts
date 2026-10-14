import { describe, expect, it } from 'vitest'
import {
  createInitialResourceStatus,
  deriveResourceStatus,
  markTransitFailed,
  markTransitLoaded,
  markVenueFailed,
  markVenueLoaded,
} from './resource-status'

describe('deriveResourceStatus', () => {
  it('preserves a venue failure when transit completes later', () => {
    const venueFailed = markVenueFailed(createInitialResourceStatus(), 'Unable to load venue data')
    const state = markTransitLoaded(venueFailed, { stopCount: 33, routeCount: 8 })

    expect(deriveResourceStatus(state)).toBe(
      '33 bus stops · 8 bus routes loaded; Unable to load venue data',
    )
  })

  it('preserves a transit failure when venues complete later', () => {
    const transitFailed = markTransitFailed(
      createInitialResourceStatus(),
      'Unable to load bus route data',
    )
    const state = markVenueLoaded(transitFailed, 12)

    expect(deriveResourceStatus(state)).toBe(
      '12 venues available; Unable to load bus route data',
    )
  })

  it('reports both failures regardless of completion order', () => {
    const venueThenTransit = markTransitFailed(
      markVenueFailed(createInitialResourceStatus(), 'Venue failed'),
      'Transit failed',
    )
    const transitThenVenue = markVenueFailed(
      markTransitFailed(createInitialResourceStatus(), 'Transit failed'),
      'Venue failed',
    )

    expect(deriveResourceStatus(venueThenTransit)).toBe('Venue failed; Transit failed')
    expect(deriveResourceStatus(transitThenVenue)).toBe('Venue failed; Transit failed')
  })
})

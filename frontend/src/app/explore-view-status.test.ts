import { describe, expect, it } from 'vitest'
import { deriveExploreViewStatus } from './explore-view-status'
import { createInitialResourceStatus } from './resource-status'

describe('deriveExploreViewStatus', () => {
  it('reports loading while either resource is pending', () => {
    expect(deriveExploreViewStatus(createInitialResourceStatus(), null, null)).toEqual({
      kind: 'loading',
      message: 'Loading map data…',
    })
  })

  it('does not report loaded resource counts', () => {
    expect(deriveExploreViewStatus({
      venue: { status: 'loaded', value: 42 },
      transit: { status: 'loaded', value: { stopCount: 33, routeCount: 8 } },
    }, null, null)).toBeNull()
  })

  it('combines application failures for the feature', () => {
    expect(deriveExploreViewStatus({
      venue: { status: 'failed', message: 'Unable to load venue data' },
      transit: { status: 'loaded', value: { stopCount: 33, routeCount: 8 } },
    }, 'Unable to load map tiles', { message: 'Unable to start map navigation' })).toEqual({
      kind: 'failure',
      message: 'Unable to start map navigation; Unable to load map tiles; Unable to load venue data',
    })
  })
})

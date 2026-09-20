import { describe, expect, it } from 'vitest'
import { deriveContextualPanelStatus } from './contextual-panel-status'
import { createInitialResourceStatus } from './resource-status'

describe('deriveContextualPanelStatus', () => {
  it('reports loading while either resource is pending', () => {
    expect(deriveContextualPanelStatus(createInitialResourceStatus(), null, null)).toEqual({
      kind: 'loading',
      message: 'Loading map data…',
    })
  })

  it('reports loaded resource counts as success', () => {
    expect(deriveContextualPanelStatus({
      venue: { status: 'loaded', value: 42 },
      transit: { status: 'loaded', value: { stopCount: 33, routeCount: 8 } },
    }, null, null)).toEqual({
      kind: 'success',
      message: '42 venues · 33 shuttle stops · 8 shuttle routes loaded',
    })
  })

  it('combines application failures for the feature', () => {
    expect(deriveContextualPanelStatus({
      venue: { status: 'failed', message: 'Unable to load venue data' },
      transit: { status: 'loaded', value: { stopCount: 33, routeCount: 8 } },
    }, 'Unable to load map tiles', { message: 'Unable to start map navigation' })).toEqual({
      kind: 'failure',
      message: 'Unable to start map navigation; Unable to load map tiles; Unable to load venue data',
    })
  })
})

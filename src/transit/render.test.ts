import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { addBusStopMarkers } from '../map/markers'
import { addValidatedBusStopMarkers } from './render'
import { createValidTransitNetwork } from './test-fixtures'

vi.mock('../map/markers', () => ({
  addBusStopMarkers: vi.fn(() => []),
}))

describe('addValidatedBusStopMarkers', () => {
  const map = {} as Map

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not create markers when network validation fails', () => {
    const network = createValidTransitNetwork()
    network.routes[0].color = '#12345'

    expect(() => addValidatedBusStopMarkers(map, network)).toThrowError(
      /Transit route A1 has non-hex route color/,
    )
    expect(addBusStopMarkers).not.toHaveBeenCalled()
  })

  it('creates markers only after validation succeeds', () => {
    const network = createValidTransitNetwork()

    const result = addValidatedBusStopMarkers(map, network)

    expect(result.network).toBe(network)
    expect(result.markers).toEqual([])
    expect(addBusStopMarkers).toHaveBeenCalledOnce()
    expect(addBusStopMarkers).toHaveBeenCalledWith(map, network.stops)
  })
})

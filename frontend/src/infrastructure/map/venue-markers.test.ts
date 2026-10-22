// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'

const markerHarness = vi.hoisted(() => ({
  markers: [] as Array<{
    element: HTMLElement
    coordinate: readonly [number, number] | null
    removed: boolean
  }>,
}))

vi.mock('maplibre-gl', () => ({
  Marker: class {
    private readonly record: typeof markerHarness.markers[number]

    constructor(options: { element?: HTMLElement }) {
      this.record = {
        element: options.element ?? document.createElement('div'),
        coordinate: null,
        removed: false,
      }
      markerHarness.markers.push(this.record)
    }

    setLngLat(coordinate: readonly [number, number]) {
      this.record.coordinate = coordinate
      return this
    }

    addTo() {
      return this
    }

    remove() {
      this.record.removed = true
    }
  },
}))

import { createVenueMarker } from './venue-markers'

afterEach(() => {
  markerHarness.markers.length = 0
})

describe('selected venue floor marker', () => {
  it.each([
    [-1, 'Basement 1'],
    [0, 'Ground floor'],
    [1, 'Floor 1'],
  ])('shows floor %i as %s in its accessible label', (floor, label) => {
    const marker = createVenueMarker({} as Map, {
      roomName: 'Seminar Room',
      floor,
      location: { x: 103.77, y: 1.3 },
    })
    const floorMarker = markerHarness.markers.find(({ element }) => (
      element.classList.contains('venue-floor-map-label')
    ))

    expect(floorMarker?.element.textContent).toBe(label)
    expect(floorMarker?.element.getAttribute('aria-label')).toBe(label)
    expect(floorMarker?.element.getAttribute('role')).toBe('img')

    marker?.dispose()
    expect(markerHarness.markers.every(({ removed }) => removed)).toBe(true)
  })

  it('does not add a floor label when floor metadata is missing', () => {
    createVenueMarker({} as Map, {
      roomName: 'Seminar Room',
      location: { x: 103.77, y: 1.3 },
    })

    expect(markerHarness.markers).toHaveLength(1)
  })
})

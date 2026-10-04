// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'

const markerHarness = vi.hoisted(() => ({
  markers: [] as Array<{
    element: HTMLDivElement
    coordinate: readonly [number, number] | null
    popupContent: HTMLElement | null
  }>,
}))

vi.mock('maplibre-gl', () => ({
  Marker: class {
    private readonly record: typeof markerHarness.markers[number]

    constructor(options: { element: HTMLDivElement }) {
      this.record = { element: options.element, coordinate: null, popupContent: null }
      markerHarness.markers.push(this.record)
    }

    setLngLat(coordinate: readonly [number, number]) {
      this.record.coordinate = coordinate
      return this
    }

    setPopup(popup: { content: HTMLElement | null }) {
      this.record.popupContent = popup.content
      return this
    }

    addTo() {
      return this
    }

    remove() {}
  },
  Popup: class {
    content: HTMLElement | null = null

    constructor(options: { offset: number }) { void options }

    setDOMContent(content: HTMLElement) {
      this.content = content
      return this
    }

    remove() {}
  },
}))

import { createTripEndpointMarkers, getTripEndpointMarkerClass } from './endpoint-markers'

afterEach(() => {
  markerHarness.markers.length = 0
})

describe('Current location endpoint markers', () => {
  it('uses the frozen coordinate and identifier-free label for the green origin pin', () => {
    const origin = {
      kind: 'current-location' as const,
      coordinate: { longitude: 103.7844, latitude: 1.2933 },
    }
    const markers = createTripEndpointMarkers(
      {} as Map,
      { origin, destination: null },
      {},
      null,
    )

    const marker = markerHarness.markers[0]
    expect(marker?.coordinate).toEqual([103.7844, 1.2933])
    expect(marker?.element.className).toBe(getTripEndpointMarkerClass('origin'))
    expect(marker?.element.getAttribute('aria-label')).toBe('Origin: Current location')
    expect(marker?.popupContent?.textContent).toContain('Current location')
    expect(marker?.popupContent?.textContent).not.toContain('ID:')

    markers.dispose()
  })
})

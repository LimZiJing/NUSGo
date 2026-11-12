// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'

const markerHarness = vi.hoisted(() => ({
  markers: [] as Array<{
    element: HTMLElement
    anchor: string | undefined
    coordinate: readonly [number, number] | null
    popupContent: HTMLElement | null
  }>,
}))

vi.mock('maplibre-gl', () => ({
  Marker: class {
    private readonly record: typeof markerHarness.markers[number]

    constructor(options: { element: HTMLElement; anchor?: string }) {
      this.record = {
        element: options.element,
        anchor: options.anchor,
        coordinate: null,
        popupContent: null,
      }
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

describe('trip endpoint marker presentation', () => {
  it('draws the origin as a grey circle and the destination as a red pin with a dark centre', () => {
    createTripEndpointMarkers(
      {} as Map,
      {
        origin: { kind: 'venue', id: 'ONE' },
        destination: { kind: 'venue', id: 'TWO' },
      },
      {
        ONE: { roomName: 'One', location: { x: 103.7, y: 1.3 } },
        TWO: { roomName: 'Two', location: { x: 103.8, y: 1.4 } },
      },
      null,
    )

    const [origin, destination] = markerHarness.markers
    expect(origin?.element.className).toBe(getTripEndpointMarkerClass('origin'))
    expect(origin?.element.getAttribute('role')).toBe('img')
    // A circle has no tip, so it is centred on the coordinate.
    expect(origin?.anchor).toBe('center')

    // The destination joins the shared pin family, so it keeps that family's bottom anchor.
    expect(destination?.element.className).toContain('map-pin')
    expect(destination?.element.className).toContain('trip-endpoint-marker-destination')
    expect(destination?.element.dataset.variant).toBe('destination')
    expect(destination?.anchor).toBe('bottom')
    expect(destination?.element.getAttribute('aria-label')).toBe('Destination: Two')
    // No A/B label anywhere on either marker; the accessible name carries the role instead.
    expect(origin?.element.textContent).toBe('')
    expect(destination?.element.textContent).toBe('')
  })

  it('omits only the origin circle when the visible Current location dot already marks it', () => {
    createTripEndpointMarkers(
      {} as Map,
      {
        origin: { kind: 'venue', id: 'ONE' },
        destination: { kind: 'venue', id: 'TWO' },
      },
      {
        ONE: { roomName: 'One', location: { x: 103.7, y: 1.3 } },
        TWO: { roomName: 'Two', location: { x: 103.8, y: 1.4 } },
      },
      null,
      null,
      { hideOrigin: true },
    )

    expect(markerHarness.markers).toHaveLength(1)
    expect(markerHarness.markers[0]?.element.className).toContain('trip-endpoint-marker-destination')
    // The destination keeps its own coordinate, so suppression never moves the destination.
    expect(markerHarness.markers[0]?.coordinate).toEqual([103.8, 1.4])
  })

  it('keeps both markers when the destination has no origin to suppress', () => {
    createTripEndpointMarkers(
      {} as Map,
      {
        origin: { kind: 'venue', id: 'ONE' },
        destination: null,
      },
      { ONE: { roomName: 'One', location: { x: 103.7, y: 1.3 } } },
      null,
      null,
      { hideOrigin: true },
    )

    expect(markerHarness.markers).toHaveLength(0)
  })
})

describe('Current location endpoint markers', () => {
  it('uses the frozen coordinate and identifier-free label for the grey origin circle', () => {
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

describe('Personal Waypoint endpoint markers', () => {
  it('shows the local waypoint name without exposing its saved ID in the popup', () => {
    const waypointId = '00000000-0000-4000-8000-000000000041'
    const markers = createTripEndpointMarkers(
      {} as Map,
      {
        origin: {
          kind: 'personal-waypoint',
          id: waypointId,
          label: 'Quiet bench',
          coordinate: { longitude: 103.78, latitude: 1.29 },
        },
        destination: null,
      },
      {},
      null,
    )

    const marker = markerHarness.markers[0]
    expect(marker?.coordinate).toEqual([103.78, 1.29])
    expect(marker?.element.getAttribute('aria-label')).toBe('Origin: Quiet bench')
    expect(marker?.popupContent?.textContent).toContain('Quiet bench')
    expect(marker?.popupContent?.textContent).not.toContain(waypointId)

    markers.dispose()
  })
})

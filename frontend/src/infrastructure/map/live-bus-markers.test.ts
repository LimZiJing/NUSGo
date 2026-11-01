// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import type { ShuttleVehiclePosition } from '@nusgo/shared'
import type { LoadedTransitData } from '../../app/contracts/data'
import type { BusRouteGeometry } from '@nusgo/shared/transit/types'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'

const markerHarness = vi.hoisted(() => ({
  markers: [] as Array<{
    element: HTMLButtonElement
    coordinate: readonly [number, number] | null
    rotation: number
    removed: boolean
    popupContent: HTMLElement | null
  }>,
}))

vi.mock('maplibre-gl', () => ({
  Marker: class {
    private readonly record: typeof markerHarness.markers[number]

    constructor(options: { element: HTMLButtonElement }) {
      this.record = {
        element: options.element,
        coordinate: null,
        rotation: 0,
        removed: false,
        popupContent: null,
      }
      markerHarness.markers.push(this.record)
    }

    setLngLat(coordinate: readonly [number, number]) {
      this.record.coordinate = coordinate
      return this
    }

    setRotation(rotation: number) {
      this.record.rotation = rotation
      return this
    }

    setRotationAlignment(alignment: string) {
      void alignment
      return this
    }

    setPopup(popup: { content: HTMLElement | null }) {
      this.record.popupContent = popup.content
      return this
    }

    addTo() {
      return this
    }

    remove() {
      this.record.removed = true
    }
  },
  Popup: class {
    content: HTMLElement | null = null

    constructor(options: { closeButton: boolean; offset: number }) {
      void options
    }

    setDOMContent(content: HTMLElement) {
      this.content = content
      return this
    }

    on(event: string, handler: () => void) {
      void event
      void handler
      return this
    }

    off(event: string, handler: () => void) {
      void event
      void handler
      return this
    }

    remove() {}
  },
}))

import { createLiveBusMarkers } from './live-bus-markers'

const observedAt = '2026-11-01T00:00:00.000Z'

function createVehicle(overrides: Partial<ShuttleVehiclePosition> = {}): ShuttleVehiclePosition {
  return {
    routeId: 'A1',
    plate: 'BUS-1',
    lat: 1.3,
    lng: 103.78,
    headingDegrees: 90,
    speed: 0,
    load: 'medium',
    observedAt,
    expiresAt: '2026-11-01T00:01:30.000Z',
    ...overrides,
  }
}

function createTransitData(): Pick<LoadedTransitData, 'index' | 'geometry'> {
  const network = createValidTransitNetwork()
  network.stops[0].longitude = 103.78
  network.stops[0].latitude = 1.3
  network.stops[1].longitude = 103.79
  network.stops[1].latitude = 1.3
  const geometry: BusRouteGeometry = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103.78, 1.3], [103.79, 1.3]] },
    }],
  }
  return {
    index: createTransitIndex(network),
    geometry,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  markerHarness.markers.length = 0
})

describe('live bus markers', () => {
  it.each([
    ['low', 1, 'Estimated crowding: low.'],
    ['medium', 2, 'Estimated crowding: medium.'],
    ['high', 3, 'Estimated crowding: high.'],
    ['unknown', 0, 'Crowding estimate unavailable.'],
  ] as const)('uses a distinct accessible load cue for %s', (load, barCount, label) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers({} as Map)

    markers.setVehicles([createVehicle({ load })], true)

    const marker = markerHarness.markers[0]?.element
    expect(marker?.dataset.loadLevel).toBe(load)
    expect(marker?.getAttribute('aria-label')).toContain(label)
    expect(marker?.querySelectorAll('.live-bus-marker-load > span')).toHaveLength(barCount)
    markers.dispose()
  })

  it('snaps markers onto the route geometry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers({} as Map)
    markers.setTransitData(createTransitData())

    markers.setVehicles([createVehicle({ lng: 103.785, lat: 1.301 })], true)

    expect(markerHarness.markers[0]?.coordinate?.[0]).toBeCloseTo(103.785, 6)
    expect(markerHarness.markers[0]?.coordinate?.[1]).toBeCloseTo(1.3, 6)
    markers.dispose()
  })

  it('shows route, next stop and estimated load in the popup', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const onSelectStop = vi.fn()
    const markers = createLiveBusMarkers({} as Map, onSelectStop)
    markers.setTransitData(createTransitData())
    markers.setVehicles([createVehicle({ lng: 103.785 })], true)

    const record = markerHarness.markers[0]
    expect(record?.element.getAttribute('aria-label')).toContain('A1 bus')
    expect(record?.element.getAttribute('aria-label')).toContain('Next stop: Stop B')
    expect(record?.popupContent?.textContent).toContain('A1')
    expect(record?.popupContent?.textContent).toContain('Next stop: Stop B')
    expect(record?.popupContent?.textContent).toContain('Estimated crowding: medium')
    record?.popupContent?.querySelector('button')?.click()
    expect(onSelectStop).toHaveBeenCalledWith('STOP-B')

    markers.dispose()
  })

  it('moves directly to the new position when reduced motion is enabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const requestFrame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const markers = createLiveBusMarkers({} as Map)
    markers.setTransitData(createTransitData())
    const first = createVehicle({ lng: 103.781, lat: 1.3 })
    markers.setVehicles([first], true)

    markers.setVehicles([{
      ...first,
      lng: 103.789,
      observedAt: '2026-11-01T00:00:30.000Z',
      expiresAt: '2026-11-01T00:02:00.000Z',
    }], true)

    expect(markerHarness.markers[0]?.coordinate).toEqual([103.789, 1.3])
    expect(requestFrame).not.toHaveBeenCalled()
    markers.dispose()
  })

  it('interpolates marker position across the route between snapshots', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const animationFrames: Array<FrameRequestCallback> = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const markers = createLiveBusMarkers({} as Map)
    markers.setTransitData(createTransitData())
    const first = createVehicle({ lng: 103.781, lat: 1.3 })
    markers.setVehicles([first], true)
    markers.setVehicles([{
      ...first,
      lng: 103.789,
      observedAt: '2026-11-01T00:00:30.000Z',
      expiresAt: '2026-11-01T00:02:00.000Z',
    }], true)

    expect(markerHarness.markers[0]?.coordinate).toEqual([103.781, 1.3])
    vi.setSystemTime(new Date('2026-11-01T00:00:15.000Z'))
    animationFrames[0]?.(0)

    expect(markerHarness.markers[0]?.coordinate?.[0]).toBeCloseTo(103.785, 6)
    expect(markerHarness.markers[0]?.coordinate?.[1]).toBeCloseTo(1.3, 6)
    markers.dispose()
  })

  it('marks aging vehicles stale, then removes them at expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers({} as Map)

    markers.setVehicles([createVehicle()], true)

    const record = markerHarness.markers[0]
    expect(record?.coordinate).toEqual([103.78, 1.3])
    expect(record?.rotation).toBe(90)
    expect(record?.element.dataset.loadLevel).toBe('medium')
    expect(record?.element.classList.contains('live-bus-marker-stale')).toBe(false)

    vi.advanceTimersByTime(60_000)
    expect(record?.element.classList.contains('live-bus-marker-stale')).toBe(true)
    expect(record?.removed).toBe(false)

    vi.advanceTimersByTime(30_000)
    expect(record?.removed).toBe(true)

    markers.dispose()
  })

  it('removes markers when hidden or disposed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers({} as Map)
    markers.setVehicles([createVehicle()], true)

    const record = markerHarness.markers[0]
    markers.setVehicles([], false)
    expect(record?.removed).toBe(true)

    markers.setVehicles([createVehicle()], true)
    const nextRecord = markerHarness.markers[1]
    markers.dispose()
    expect(nextRecord?.removed).toBe(true)
  })
})

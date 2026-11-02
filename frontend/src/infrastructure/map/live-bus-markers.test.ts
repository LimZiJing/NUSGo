// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import type { ShuttleVehiclePosition } from '@nusgo/shared'
import type { LoadedTransitData } from '../../app/contracts/data'
import type { BusRouteGeometry } from '@nusgo/shared/transit/types'
import { createTransitIndex } from '../../domain/transit'
import { createTransferTransitNetwork, createValidTransitNetwork } from '../../domain/transit/test-fixtures'

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

function createMap(): Map {
  return { getBearing: vi.fn(() => 0), on: vi.fn(), off: vi.fn() } as unknown as Map
}

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
    ['low', 'Estimated crowding: low.'],
    ['medium', 'Estimated crowding: medium.'],
    ['high', 'Estimated crowding: high.'],
    ['unknown', 'Crowding estimate unavailable.'],
  ] as const)('keeps %s crowding accessible without adding visual load bars', (load, label) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers(createMap())

    markers.setVehicles([createVehicle({ load })], true)

    const marker = markerHarness.markers[0]?.element
    expect(marker?.dataset.loadLevel).toBe(load)
    expect(marker?.getAttribute('aria-label')).toContain(label)
    expect(marker?.querySelector('.live-bus-marker-load')).toBeNull()
    expect(marker?.querySelector('.live-bus-marker-route')?.textContent).toBe('A1')
    expect(marker?.style.getPropertyValue('--live-bus-route-color')).toBe('')
    markers.dispose()
  })

  it('distinguishes routes by their visible ID and canonical colour with contrasting badge text', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers(createMap())
    const network = createTransferTransitNetwork()
    network.routes[0].color = '#ffff00'
    network.routes[1].color = '#123456'
    markers.setTransitData({ ...createTransitData(), index: createTransitIndex(network) })

    markers.setVehicles([createVehicle(), createVehicle({ routeId: 'B1' })], true)

    const [first, second] = markerHarness.markers.map(({ element }) => element)
    expect(first.querySelector('.live-bus-marker-route')?.textContent).toBe('A1')
    expect(second.querySelector('.live-bus-marker-route')?.textContent).toBe('B1')
    expect(first.style.getPropertyValue('--live-bus-route-color')).toBe('#ffff00')
    expect(second.style.getPropertyValue('--live-bus-route-color')).toBe('#123456')
    expect(first.style.getPropertyValue('--live-bus-route-text')).toBe('#000000')
    expect(second.style.getPropertyValue('--live-bus-route-text')).toBe('#ffffff')
    expect(first.querySelector('.live-bus-model')).not.toBeNull()
    markers.dispose()
  })

  it('rotates the vehicle while keeping the route label upright, and releases the map listener', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    let rotate: () => void = () => undefined
    const map = {
      getBearing: vi.fn(() => 30),
      on: vi.fn((_event: string, handler: () => void) => { rotate = handler }),
      off: vi.fn(),
    }
    const markers = createLiveBusMarkers(map as unknown as Map)
    markers.setVehicles([createVehicle({ headingDegrees: 90 })], true)
    const record = markerHarness.markers[0]
    const arrow = record.element.querySelector<HTMLElement>('.live-bus-marker-heading')
    const badge = record.element.querySelector<HTMLElement>('.live-bus-marker-route')
    expect(arrow?.querySelector('.live-bus-model')).not.toBeNull()
    expect(arrow?.style.transform).toBe('rotateX(45deg) rotateZ(60deg)')
    expect(record.rotation).toBe(0)
    expect(badge?.style.transform).toBe('')

    map.getBearing.mockReturnValue(90)
    rotate()
    expect(arrow?.style.transform).toBe('rotateX(45deg) rotateZ(0deg)')
    markers.setVehicles([createVehicle({ headingDegrees: 180 })], true)
    expect(arrow?.style.transform).toBe('rotateX(45deg) rotateZ(90deg)')
    expect(badge?.textContent).toBe('A1')
    expect(record.rotation).toBe(0)

    markers.dispose()
    expect(map.off).toHaveBeenCalledWith('rotate', rotate)
  })

  it('snaps markers onto the route geometry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers(createMap())
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
    const markers = createLiveBusMarkers(createMap(), onSelectStop)
    markers.setTransitData(createTransitData())
    markers.setVehicles([createVehicle({ lng: 103.785 })], true)

    const record = markerHarness.markers[0]
    expect(record?.element.getAttribute('aria-label')).toContain('A1 bus')
    expect(record?.element.getAttribute('aria-label')).toContain('Next stop: Stop B')
    const popup = record?.popupContent
    expect(popup?.querySelector('.live-bus-popup-route')?.textContent).toBe('A1')
    expect(popup?.style.getPropertyValue('--live-bus-route-color')).toBe('#123456')
    expect(popup?.style.getPropertyValue('--live-bus-route-text')).toBe('#ffffff')
    expect(popup?.querySelector('.live-bus-popup-next-name')?.textContent).toBe('Stop B')
    expect(popup?.querySelector('.live-bus-popup-load-value')?.textContent).toBe('Medium crowding')
    expect(popup?.querySelector('.live-bus-popup-load-value')?.getAttribute('aria-label')).toBe('Estimated crowding: medium')
    expect(popup?.querySelector('.live-bus-popup-load-value')?.getAttribute('data-load-level')).toBe('medium')
    const stopAction = popup?.querySelector<HTMLButtonElement>('.live-bus-popup-stop-action')
    expect(stopAction?.textContent).toBe('Stop B›')
    expect(stopAction?.getAttribute('aria-label')).toBe('View details for Stop B bus stop')
    stopAction?.click()
    expect(onSelectStop).toHaveBeenCalledWith('STOP-B')

    markers.dispose()
    stopAction?.click()
    expect(onSelectStop).toHaveBeenCalledTimes(1)
  })

  it('keeps missing stop and crowding estimates explicit without an unavailable stop action', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const markers = createLiveBusMarkers(createMap(), vi.fn())
    markers.setVehicles([createVehicle({ load: 'unknown' })], true)

    const popup = markerHarness.markers[0]?.popupContent
    expect(popup?.querySelector('.live-bus-popup-next-name')?.textContent).toBe('Unavailable')
    expect(popup?.querySelector('.live-bus-popup-load-value')?.textContent).toBe('Crowding unknown')
    expect(popup?.querySelector('.live-bus-popup-stop-action')).toBeNull()
    expect(popup?.style.getPropertyValue('--live-bus-route-color')).toBe('')
    markers.dispose()
  })

  it('moves directly to the new position when reduced motion is enabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const requestFrame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const markers = createLiveBusMarkers(createMap())
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
    const markers = createLiveBusMarkers(createMap())
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
    const markers = createLiveBusMarkers(createMap())

    markers.setVehicles([createVehicle()], true)

    const record = markerHarness.markers[0]
    expect(record?.coordinate).toEqual([103.78, 1.3])
    expect(record?.rotation).toBe(0)
    expect(record?.element.querySelector<HTMLElement>('.live-bus-marker-heading')?.style.transform)
      .toBe('rotateX(45deg) rotateZ(90deg)')
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
    const markers = createLiveBusMarkers(createMap())
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

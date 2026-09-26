import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap, Popup } from 'maplibre-gl'
import {
  BUS_STOP_INACTIVE_OPACITY,
  BUS_STOP_INACTIVE_LABEL_LAYER_ID,
  BUS_STOP_MIN_ZOOM,
  createBusStopLabelGeoJson,
  getBusStopLabelFilters,
  getBusStopLabelOpacity,
  isBusStopVisible,
  isBusStopDimmed,
  createShuttleStopMarkers,
} from './shuttle-stops'
import { getTripEndpointMarkerClass } from './endpoint-markers'
import type { TransitStop } from '../../domain/transit/types'
import { createBusStopPopupContent, createPopupCoordinator } from './popup'

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    readonly element: HTMLElement
    popup: FakePopup | null = null

    constructor(options: { element?: HTMLElement }) {
      this.element = options.element ?? document.createElement('div')
    }

    getElement() {
      return this.element
    }

    setLngLat() {
      return this
    }

    setOpacity(opacity: string | number) {
      this.element.style.opacity = String(opacity)
      return this
    }

    setPopup(popup: FakePopup) {
      this.popup = popup
      return this
    }

    getPopup() {
      return this.popup
    }

    togglePopup() {
      if (this.element.style.opacity === String(BUS_STOP_INACTIVE_OPACITY)) return this
      if (this.popup?.isOpen()) this.popup.remove()
      else this.popup?.show()
      return this
    }

    remove() {
      return this
    }

    addTo() {
      return this
    }
  }

  class FakePopup {
    readonly handlers = new globalThis.Map<string, Set<() => void>>()
    open = false

    setDOMContent() {
      return this
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    }

    off(event: string, handler: () => void) {
      this.handlers.get(event)?.delete(handler)
      return this
    }

    isOpen() {
      return this.open
    }

    show() {
      this.open = true
      this.handlers.get('open')?.forEach((handler) => handler())
    }

    remove() {
      this.open = false
      this.handlers.get('close')?.forEach((handler) => handler())
      return this
    }
  }

  return {
    Map: class {},
    Marker: FakeMarker,
    Popup: FakePopup,
  }
})

type PopupEvent = 'open' | 'close'

function createFakePopup() {
  const listeners: Record<PopupEvent, Array<() => void>> = {
    open: [],
    close: [],
  }
  const popup = {
    on: vi.fn((event: PopupEvent, listener: () => void) => {
      listeners[event].push(listener)
      return popup
    }),
    off: vi.fn(() => popup),
    remove: vi.fn(() => {
      listeners.close.forEach((listener) => listener())
    }),
    emit: (event: PopupEvent) => {
      listeners[event].forEach((listener) => listener())
    },
  }
  return popup
}

describe('createPopupCoordinator', () => {
  it('closes the previously opened bus-stop popup', () => {
    const first = createFakePopup()
    const second = createFakePopup()
    const coordinator = createPopupCoordinator()
    coordinator.register(first as unknown as Popup)
    coordinator.register(second as unknown as Popup)

    first.emit('open')
    second.emit('open')

    expect(first.remove).toHaveBeenCalledOnce()
    expect(second.remove).not.toHaveBeenCalled()
  })

  it('does not remove an already closed popup or an unregistered venue popup', () => {
    const stop = createFakePopup()
    const venue = createFakePopup()
    const coordinator = createPopupCoordinator()
    coordinator.register(stop as unknown as Popup)

    stop.emit('open')
    stop.emit('close')
    venue.emit('open')
    const anotherStop = createFakePopup()
    coordinator.register(anotherStop as unknown as Popup)
    anotherStop.emit('open')

    expect(stop.remove).not.toHaveBeenCalled()
    expect(venue.remove).not.toHaveBeenCalled()
  })

  it('unregisters popup listeners and disposes active coordination', () => {
    const popup = createFakePopup()
    const coordinator = createPopupCoordinator()
    const unregister = coordinator.register(popup as unknown as Popup)

    unregister()
    popup.emit('open')
    expect(popup.remove).not.toHaveBeenCalled()

    coordinator.register(popup as unknown as Popup)
    popup.emit('open')
    coordinator.dispose()
    popup.emit('open')

    expect(popup.off).toHaveBeenCalled()
    expect(popup.remove).toHaveBeenCalledOnce()
  })
})

class FakeElement {
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  listeners = new Map<string, () => void>()
  className = ''
  classes = new Set<string>()
  classList = {
    toggle: (name: string, force: boolean) => {
      if (force) this.classes.add(name)
      else this.classes.delete(name)
    },
  }
  style = {
    display: '',
    opacity: '',
    pointerEvents: '',
    setProperty: vi.fn(),
  }
  dataset: Record<string, string> = {}
  textContent = ''
  type = ''
  tagName: string
  disabled = false
  tabIndex = 0

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  append(...children: FakeElement[]) {
    this.children.push(...children)
  }

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, listener)
  }

  removeEventListener(event: string, listener: () => void) {
    if (this.listeners.get(event) === listener) this.listeners.delete(event)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  click() {
    this.listeners.get('click')?.()
  }
}

describe('trip endpoint markers and shuttle-stop actions', () => {
  it('uses distinct marker classes for origin and destination', () => {
    expect(getTripEndpointMarkerClass('origin')).toBe(
      'trip-endpoint-marker trip-endpoint-marker-origin',
    )
    expect(getTripEndpointMarkerClass('destination')).toBe(
      'trip-endpoint-marker trip-endpoint-marker-destination',
    )
  })

  it('exposes safe text actions for assigning a shuttle stop to either endpoint', () => {
    const documentStub = {
      createElement: (tagName: string) => new FakeElement(tagName),
    }
    vi.stubGlobal('document', documentStub)
    const onSetEndpoint = vi.fn()
    const stop = {
      id: 'STOP-A',
      longName: '<Central Library>',
      shortName: 'Library',
      latitude: 1.3,
      longitude: 103.77,
      services: ['A1'],
    }

    const popupContent = createBusStopPopupContent(stop, onSetEndpoint)
    const content = popupContent.element as unknown as FakeElement
    const buttons = content.children.filter((child) => child.tagName === 'BUTTON')

    expect(content.children[0].textContent).toBe('<Central Library>')
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Set as origin',
      'Set as destination',
    ])

    buttons[0].click()
    buttons[1].click()
    expect(onSetEndpoint).toHaveBeenNthCalledWith(1, 'origin', {
      kind: 'stop',
      id: 'STOP-A',
    })
    expect(onSetEndpoint).toHaveBeenNthCalledWith(2, 'destination', {
      kind: 'stop',
      id: 'STOP-A',
    })

    popupContent.dispose()
    buttons[0].click()
    expect(onSetEndpoint).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })
})

describe('bus-stop presentation', () => {
  const stops: TransitStop[] = [
    {
      id: 'STOP-A',
      longName: 'Central Library',
      shortName: 'Library',
      latitude: 1.3,
      longitude: 103.77,
      services: ['A1'],
    },
    {
      id: 'STOP-B',
      longName: 'Invalid coordinates',
      shortName: 'Invalid',
      latitude: Number.NaN,
      longitude: 103.78,
      services: ['A1'],
    },
  ]

  it('applies and clears route selection through the public marker adapter', () => {
    vi.stubGlobal('document', {
      createElement: (tagName: string) => new FakeElement(tagName),
    })
    const map = {
      getSource: vi.fn(() => undefined),
      getLayer: vi.fn(() => ({})),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      removeSource: vi.fn(),
      removeLayer: vi.fn(),
      setFilter: vi.fn(),
      setLayerZoomRange: vi.fn(),
      setPaintProperty: vi.fn(),
      getZoom: vi.fn(() => 15),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as MapLibreMap
    const adapter = createShuttleStopMarkers(map, stops.map((stop, index) => ({
      ...stop,
      latitude: 1.3 + index / 10,
    })))
    const markers = adapter.markers.map((marker) => marker.getElement() as unknown as FakeElement)

    adapter.setSelection(['STOP-A'], '#e3cf0e')

    expect(markers[0].classes).toContain('bus-stop-marker-selected')
    expect(markers[1].classes).toContain('bus-stop-marker-dimmed')
    expect(markers[0].style.opacity).toBe('1')
    expect(markers[1].style.opacity).toBe(String(BUS_STOP_INACTIVE_OPACITY))
    expect(markers[0].style.setProperty).toHaveBeenCalledWith(
      '--bus-stop-selected-color',
      '#e3cf0e',
    )

    adapter.setSelection(null)

    expect(markers.every((marker) => (
      !marker.classes.has('bus-stop-marker-selected') &&
      !marker.classes.has('bus-stop-marker-dimmed')
    ))).toBe(true)
    expect(markers.every((marker) => marker.style.opacity === '1')).toBe(true)
    adapter.dispose()
    vi.unstubAllGlobals()
  })

  it('keeps journey stops prominent and enables other markers only while their popup is focused', () => {
    vi.stubGlobal('document', {
      createElement: (tagName: string) => new FakeElement(tagName),
    })
    const paintProperties: Array<{ id: string; name: string; value: unknown }> = []
    const map = {
      getSource: vi.fn(() => ({})),
      getLayer: vi.fn(() => ({})),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      removeSource: vi.fn(),
      removeLayer: vi.fn(),
      setFilter: vi.fn(),
      setLayerZoomRange: vi.fn(),
      setPaintProperty: vi.fn((id: string, name: string, value: unknown) => {
        paintProperties.push({ id, name, value })
      }),
      getZoom: vi.fn(() => 12),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as MapLibreMap
    const adapter = createShuttleStopMarkers(map, stops.map((stop, index) => ({
      ...stop,
      latitude: 1.3 + index / 10,
    })))
    const elements = adapter.markers.map((marker) => marker.getElement() as unknown as FakeElement)
    const inactivePopup = adapter.markers[1].getPopup() as unknown as {
      show(): void
      isOpen(): boolean
    }
    inactivePopup.show()

    adapter.setJourneyStops(new Map([['STOP-A', [{
      routeId: 'A1',
      routeName: 'A1',
      color: '#123456',
    }]]]))

    expect(elements[0].disabled).toBe(false)
    expect(elements[0].classes).not.toContain('bus-stop-marker-dimmed')
    expect(elements[0].classes).toContain('bus-stop-marker-journey')
    expect(elements[0].style.opacity).toBe('1')
    expect(elements[0].style.setProperty).toHaveBeenCalledWith(
      '--bus-stop-journey-color',
      'linear-gradient(#123456, #123456)',
    )
    expect(elements[0].attributes.get('aria-label')).toBe(
      'Central Library shuttle stop on Journey Route A1',
    )
    expect(elements[0].attributes.get('title')).toBe(
      'Central Library shuttle stop on Journey Route A1',
    )
    expect(elements[1].disabled).toBe(true)
    expect(elements[1].tabIndex).toBe(-1)
    expect(elements[1].attributes.get('aria-disabled')).toBe('true')
    expect(elements[1].style.pointerEvents).toBe('none')
    expect(elements[1].classes).toContain('bus-stop-marker-dimmed')
    expect(elements[1].style.opacity).toBe(String(BUS_STOP_INACTIVE_OPACITY))
    expect(inactivePopup.isOpen()).toBe(false)

    expect(adapter.openStopPopup('STOP-B')).toBe(true)
    expect(inactivePopup.isOpen()).toBe(true)
    expect(elements[1].disabled).toBe(false)
    expect(elements[1].attributes.get('aria-disabled')).toBe('false')
    expect(elements[1].classes).not.toContain('bus-stop-marker-dimmed')

    expect(paintProperties).toContainEqual({
      id: BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      name: 'text-color',
      value: '#64748b',
    })
    expect(paintProperties).toContainEqual({
      id: BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      name: 'text-opacity',
      value: BUS_STOP_INACTIVE_OPACITY,
    })

    adapter.setJourneyStops(null)

    expect(elements[1].disabled).toBe(false)
    expect(elements[1].tabIndex).toBe(0)
    expect(elements[1].attributes.get('aria-disabled')).toBe('false')
    expect(elements[1].style.pointerEvents).toBe('')
    expect(elements[1].classes).not.toContain('bus-stop-marker-dimmed')
    expect(elements[1].style.opacity).toBe('1')
    expect(elements[0].classes).not.toContain('bus-stop-marker-journey')
    expect(elements[0].style.setProperty).toHaveBeenLastCalledWith(
      '--bus-stop-journey-color',
      '',
    )
    expect(elements[0].attributes.get('aria-label')).toBe('Central Library shuttle stop')
    expect(elements[0].attributes.get('title')).toBeUndefined()
    adapter.dispose()
    vi.unstubAllGlobals()
  })

  it('keeps active and focused labels out of the inactive layer', () => {
    expect(getBusStopLabelFilters(new Set(['STOP-A']), new Set(['STOP-B']))).toEqual({
      active: ['in', ['get', 'stopId'], ['literal', ['STOP-A', 'STOP-B']]],
      inactive: ['!', ['in', ['get', 'stopId'], ['literal', ['STOP-A', 'STOP-B']]]],
    })
    expect(getBusStopLabelFilters(null, new Set())).toEqual({
      active: ['in', ['get', 'stopId'], ['literal', []]],
      inactive: null,
    })
  })

  it('uses full label opacity for all routes and the inactive opacity for a selection', () => {
    expect(getBusStopLabelOpacity(null)).toBe(1)
    expect(getBusStopLabelOpacity(new Set(['STOP-A']))).toBe(BUS_STOP_INACTIVE_OPACITY)
  })

  it('does not dim active or focused stops', () => {
    expect(isBusStopDimmed(false, false, false)).toBe(false)
    expect(isBusStopDimmed(true, true, false)).toBe(false)
    expect(isBusStopDimmed(true, false, true)).toBe(false)
    expect(isBusStopDimmed(true, false, false)).toBe(true)
  })

  it('creates short-name point features and skips invalid coordinates', () => {
    expect(createBusStopLabelGeoJson(stops)).toEqual({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { stopId: 'STOP-A', shortName: 'Library' },
        geometry: { type: 'Point', coordinates: [103.77, 1.3] },
      }],
    })
  })

  it('shows stops at the normal threshold or when route/stop content is focused', () => {
    expect(isBusStopVisible(BUS_STOP_MIN_ZOOM - 0.1, false, false)).toBe(false)
    expect(isBusStopVisible(BUS_STOP_MIN_ZOOM, false, false)).toBe(true)
    expect(isBusStopVisible(BUS_STOP_MIN_ZOOM - 0.1, true, false)).toBe(true)
    expect(isBusStopVisible(BUS_STOP_MIN_ZOOM - 0.1, false, true)).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { Marker, Popup } from 'maplibre-gl'
import {
  BUS_STOP_INACTIVE_OPACITY,
  BUS_STOP_MIN_ZOOM,
  createBusStopLabelGeoJson,
  getBusStopLabelFilters,
  getBusStopLabelOpacity,
  isBusStopVisible,
  isBusStopDimmed,
  setBusStopMarkerSelection,
} from './shuttle-stops'
import { getTripEndpointMarkerClass } from './endpoint-markers'
import type { TransitStop } from '../../domain/transit/types'
import { createBusStopPopupContent, createPopupCoordinator } from './popup'

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
  dataset: Record<string, string> = {}
  textContent = ''
  type = ''
  tagName: string

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

  it('uses the selected route color for selected stop rings', () => {
    const style = {
      display: '',
      setProperty: vi.fn(),
    }
    const marker = {
      getElement: () => ({
        dataset: { stopId: 'STOP-A' },
        classList: { toggle: vi.fn() },
        style,
      }),
      getPopup: () => null,
    } as unknown as Marker

    setBusStopMarkerSelection([marker], ['STOP-A'], '#e3cf0e')

    expect(style.setProperty).toHaveBeenCalledWith('--bus-stop-selected-color', '#e3cf0e')
  })

  it('dims only inactive stops when a route is selected', () => {
    const activeClasses = new Set<string>()
    const inactiveClasses = new Set<string>()
    const createMarker = (stopId: string, classes: Set<string>) => ({
      getElement: () => ({
        dataset: { stopId },
        classList: {
          toggle(name: string, force: boolean) {
            if (force) classes.add(name)
            else classes.delete(name)
          },
        },
        style: { setProperty: vi.fn(), display: '' },
      }),
      getPopup: () => null,
    } as unknown as Marker)

    setBusStopMarkerSelection(
      [createMarker('STOP-A', activeClasses)],
      ['STOP-A'],
      '#e3cf0e',
    )
    setBusStopMarkerSelection(
      [createMarker('STOP-B', inactiveClasses)],
      ['STOP-A'],
      '#e3cf0e',
    )

    expect(activeClasses).not.toContain('bus-stop-marker-dimmed')
    expect(inactiveClasses).toContain('bus-stop-marker-dimmed')
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

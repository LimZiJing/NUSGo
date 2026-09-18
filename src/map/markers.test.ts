import { describe, expect, it, vi } from 'vitest'
import type { Marker, Popup } from 'maplibre-gl'
import {
  BUS_STOP_MIN_ZOOM,
  createBusStopLabelGeoJson,
  createBusStopPopupCoordinator,
  isBusStopVisible,
  setBusStopMarkerSelection,
} from './markers'
import type { TransitStop } from '../types/transit'

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
    remove: vi.fn(() => {
      listeners.close.forEach((listener) => listener())
    }),
    emit: (event: PopupEvent) => {
      listeners[event].forEach((listener) => listener())
    },
  }
  return popup
}

describe('createBusStopPopupCoordinator', () => {
  it('closes the previously opened bus-stop popup', () => {
    const first = createFakePopup()
    const second = createFakePopup()
    const coordinator = createBusStopPopupCoordinator()
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
    const coordinator = createBusStopPopupCoordinator()
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

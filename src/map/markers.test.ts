import { describe, expect, it, vi } from 'vitest'
import type { Popup } from 'maplibre-gl'
import {
  createBusStopPopupContent,
  createBusStopPopupCoordinator,
  getTripEndpointMarkerClass,
} from './markers'

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

    const content = createBusStopPopupContent(stop, onSetEndpoint) as unknown as FakeElement
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

    vi.unstubAllGlobals()
  })
})

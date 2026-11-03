// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Map } from 'maplibre-gl'
import type { PersonalWaypoint } from '../../domain/waypoints/personal/personal-waypoint'
import { createPersonalWaypointMarkers } from './personal-waypoint-markers'

const markerState = vi.hoisted(() => ({
  instances: [] as Array<{
    readonly element: HTMLElement
    coordinates: readonly [number, number] | null
    setLngLatCalls: number
    added: boolean
  }>,
}))

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    readonly element: HTMLElement
    coordinates: readonly [number, number] | null = null
    setLngLatCalls = 0
    added = false

    constructor(options: { readonly element: HTMLElement }) {
      this.element = options.element
      markerState.instances.push(this)
    }

    setLngLat(coordinates: readonly [number, number]) {
      this.coordinates = coordinates
      this.setLngLatCalls += 1
      return this
    }

    addTo() {
      this.added = true
      document.body.append(this.element)
      return this
    }

    remove() {
      this.added = false
      this.element.remove()
      return this
    }
  }

  return { Marker: FakeMarker }
})

const waypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

afterEach(() => {
  document.body.replaceChildren()
  markerState.instances.length = 0
})

describe('createPersonalWaypointMarkers', () => {
  it('creates a keyboard-accessible marker button and reports its waypoint when selected', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const markers = createPersonalWaypointMarkers({} as Map)

    markers.setWaypoints([waypoint], true, onSelect)
    const button = document.querySelector<HTMLButtonElement>('.personal-waypoint-marker')

    expect(button?.type).toBe('button')
    expect(button?.getAttribute('aria-label')).toBe(
      'Open Quiet bench, Rest spot details. General icon, Blue marker.',
    )
    expect(button?.dataset.markerColor).toBe('blue')
    expect(button?.dataset.markerIcon).toBe('dot')
    expect(button?.querySelector('svg')).not.toBeNull()
    expect(markerState.instances[0]?.coordinates).toEqual([103.78, 1.29])

    expect(button).not.toBeNull()
    await user.click(button!)
    expect(onSelect).toHaveBeenCalledWith(waypoint.id, button)
    button?.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(2)
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(3)

    markers.dispose()
  })

  it('updates marker labels and positions, and removes waypoints no longer saved', () => {
    const markers = createPersonalWaypointMarkers({} as Map)
    const revisedWaypoint = {
      ...waypoint,
      name: 'Shaded bench',
      category: 'Quiet place',
      coordinate: { longitude: 103.79, latitude: 1.30 },
      markerColor: 'purple' as const,
      markerIcon: 'rest' as const,
    }

    markers.setWaypoints([waypoint], true, () => undefined)
    markers.setWaypoints([revisedWaypoint], true, () => undefined)

    expect(markerState.instances).toHaveLength(1)
    expect(markerState.instances[0]?.coordinates).toEqual([103.79, 1.30])
    expect(document.querySelector('.personal-waypoint-marker')?.getAttribute('aria-label'))
      .toBe('Open Shaded bench, Quiet place details. Rest icon, Purple marker.')
    expect(document.querySelector('.personal-waypoint-marker')?.getAttribute('data-marker-color')).toBe('purple')
    expect(document.querySelector('.personal-waypoint-marker')?.getAttribute('data-marker-icon')).toBe('rest')

    markers.setWaypoints([], true, () => undefined)
    expect(document.querySelector('.personal-waypoint-marker')).toBeNull()
    expect(markerState.instances[0]?.added).toBe(false)
  })

  it('does no marker presentation work for ten unchanged waypoint refreshes', async () => {
    const markers = createPersonalWaypointMarkers({} as Map)
    markers.setWaypoints([waypoint], true, () => undefined)

    const button = document.querySelector<HTMLButtonElement>('.personal-waypoint-marker')!
    const icon = button.querySelector('.personal-waypoint-marker-icon')!
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((records) => mutations.push(...records))
    observer.observe(button, { attributes: true, attributeOldValue: true })
    observer.observe(icon, { childList: true })

    for (let refresh = 0; refresh < 10; refresh += 1) {
      markers.setWaypoints([{ ...waypoint }], true, () => undefined)
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    observer.disconnect()

    const markerMutations = mutations.filter(({ target }) => target === button)
    expect({
      coordinateWrites: markerState.instances[0]?.setLngLatCalls,
      accessibleLabelWrites: markerMutations.filter(({ attributeName }) => attributeName === 'aria-label').length,
      colorWrites: markerMutations.filter(({ attributeName }) => attributeName === 'data-marker-color').length,
      iconNameWrites: markerMutations.filter(({ attributeName }) => attributeName === 'data-marker-icon').length,
      iconSubtreeReplacements: mutations.filter(({ target }) => target === icon && target instanceof Element).length,
    }).toEqual({
      coordinateWrites: 1,
      accessibleLabelWrites: 0,
      colorWrites: 0,
      iconNameWrites: 0,
      iconSubtreeReplacements: 0,
    })

    markers.dispose()
  })

  it('uses a safe general glyph and accessible label for an unknown icon value', () => {
    const markers = createPersonalWaypointMarkers({} as Map)
    const unrecognizedWaypoint = {
      ...waypoint,
      name: '<img src=x onerror=alert(1)>',
      category: 'Custom place',
      markerIcon: 'unrecognized' as PersonalWaypoint['markerIcon'],
    }

    markers.setWaypoints([unrecognizedWaypoint], true, () => undefined)

    const button = document.querySelector<HTMLButtonElement>('.personal-waypoint-marker')
    expect(button?.getAttribute('aria-label')).toBe(
      'Open <img src=x onerror=alert(1)>, Custom place details. General icon, Blue marker.',
    )
    expect(button?.querySelector('img')).toBeNull()
    expect(button?.querySelector('svg circle')).not.toBeNull()

    markers.dispose()
  })

  it('keeps marker identity through reorder and uses the latest selection callback', () => {
    const markers = createPersonalWaypointMarkers({} as Map)
    const secondWaypoint = { ...waypoint, id: '00000000-0000-4000-8000-000000000002', name: 'Quiet lawn' }
    const staleSelection = vi.fn()
    const currentSelection = vi.fn()

    markers.setWaypoints([waypoint, secondWaypoint], true, staleSelection)
    const firstButton = markerState.instances[0]?.element
    const secondButton = markerState.instances[1]?.element
    markers.setWaypoints([secondWaypoint, waypoint], true, currentSelection)
    firstButton?.click()
    secondButton?.click()

    expect(markerState.instances).toHaveLength(2)
    expect(markerState.instances[0]?.element).toBe(firstButton)
    expect(markerState.instances[1]?.element).toBe(secondButton)
    expect(staleSelection).not.toHaveBeenCalled()
    expect(currentSelection).toHaveBeenNthCalledWith(1, waypoint.id, firstButton)
    expect(currentSelection).toHaveBeenNthCalledWith(2, secondWaypoint.id, secondButton)

    markers.dispose()
  })

  it('adds a hidden saved waypoint marker when focusing it', () => {
    const markers = createPersonalWaypointMarkers({} as Map)
    markers.setWaypoints([], true, () => undefined)

    markers.focusWaypoint(waypoint)

    const button = document.querySelector<HTMLButtonElement>('.personal-waypoint-marker')
    expect(button?.getAttribute('aria-label'))
      .toBe('Open Quiet bench, Rest spot details. General icon, Blue marker.')
    expect(markerState.instances).toHaveLength(1)
    expect(markerState.instances[0]?.coordinates).toEqual([103.78, 1.29])
    expect(markerState.instances[0]?.added).toBe(true)

    markers.setWaypoints([], true, () => undefined)
    expect(document.querySelector('.personal-waypoint-marker')).toBeNull()
    expect(markerState.instances[0]?.added).toBe(false)
    markers.dispose()
  })

  it('hides markers during placement and removes their listeners on disposal', () => {
    const onSelect = vi.fn()
    const markers = createPersonalWaypointMarkers({} as Map)
    markers.setWaypoints([waypoint], true, onSelect)
    const button = document.querySelector<HTMLButtonElement>('.personal-waypoint-marker')

    markers.setWaypoints([waypoint], false, onSelect)
    expect(document.querySelector('.personal-waypoint-marker')).toBeNull()
    button?.click()
    expect(onSelect).not.toHaveBeenCalled()

    markers.setWaypoints([waypoint], true, onSelect)
    markers.dispose()
    button?.click()
    expect(onSelect).not.toHaveBeenCalled()
    expect(markerState.instances[0]?.added).toBe(false)
  })
})

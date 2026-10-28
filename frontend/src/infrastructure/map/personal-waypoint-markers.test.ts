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
    added: boolean
  }>,
}))

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    readonly element: HTMLElement
    coordinates: readonly [number, number] | null = null
    added = false

    constructor(options: { readonly element: HTMLElement }) {
      this.element = options.element
      markerState.instances.push(this)
    }

    setLngLat(coordinates: readonly [number, number]) {
      this.coordinates = coordinates
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
    expect(button?.getAttribute('aria-label')).toBe('Open Quiet bench, Rest spot details')
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
      coordinate: { longitude: 103.79, latitude: 1.30 },
    }

    markers.setWaypoints([waypoint], true, () => undefined)
    markers.setWaypoints([revisedWaypoint], true, () => undefined)

    expect(markerState.instances).toHaveLength(1)
    expect(markerState.instances[0]?.coordinates).toEqual([103.79, 1.30])
    expect(document.querySelector('.personal-waypoint-marker')?.getAttribute('aria-label'))
      .toBe('Open Shaded bench, Rest spot details')

    markers.setWaypoints([], true, () => undefined)
    expect(document.querySelector('.personal-waypoint-marker')).toBeNull()
    expect(markerState.instances[0]?.added).toBe(false)
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

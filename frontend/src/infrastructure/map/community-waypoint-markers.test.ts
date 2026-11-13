// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Map } from 'maplibre-gl'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { createCommunityWaypointMarkers } from './community-waypoint-markers'

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

const waypoint: CommunityWaypoint = {
  id: 'cw-water-001',
  displayLabel: 'Water cooler',
  category: 'water_cooler',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  source: 'NUS Campus Facilities',
  updatedAt: '2026-10-26',
}

afterEach(() => {
  document.body.replaceChildren()
  markerState.instances.length = 0
})

describe('createCommunityWaypointMarkers', () => {
  it('creates a distinct keyboard-accessible marker and reports its waypoint', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const markers = createCommunityWaypointMarkers({} as Map)

    markers.setWaypoints([waypoint], onSelect)
    const button = document.querySelector<HTMLButtonElement>('.community-waypoint-marker')

    expect(button?.type).toBe('button')
    expect(button?.dataset.category).toBe('water_cooler')
    expect(button?.dataset.hoverTreatment).toBe('custom')
    expect(button?.getAttribute('aria-label')).toBe('Open details for Water cooler')
    expect(button?.querySelector('.community-waypoint-marker-icon svg')?.classList.contains('lucide-droplets')).toBe(true)
    expect(markerState.instances[0]?.coordinates).toEqual([103.78, 1.29])

    await user.click(button!)
    expect(onSelect).toHaveBeenCalledWith(waypoint.id, button)
    button?.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(2)
    markers.dispose()
  })

  it('uses the printing and photocopying icon', () => {
    const printingWaypoint: CommunityWaypoint = {
      ...waypoint,
      id: 'cw-printing-001',
      displayLabel: 'Printing / photocopying · Central Library · Floor 2',
      category: 'printing',
    }
    const markers = createCommunityWaypointMarkers({} as Map)

    markers.setWaypoints([printingWaypoint], vi.fn())
    const button = document.querySelector<HTMLButtonElement>('.community-waypoint-marker')

    expect(button?.dataset.category).toBe('printing')
    expect(button?.getAttribute('aria-label')).toBe('Open details for Printing / photocopying · Central Library · Floor 2')
    expect(button?.querySelector('.community-waypoint-marker-icon svg')?.classList.contains('lucide-printer')).toBe(true)
    markers.dispose()
  })

  it('updates existing marker presentation and coordinate, removes stale markers, and disposes listeners', () => {
    const onSelect = vi.fn()
    const markers = createCommunityWaypointMarkers({} as Map)
    const revisedWaypoint: CommunityWaypoint = {
      ...waypoint,
      displayLabel: 'Toilet',
      category: 'toilet',
      coordinate: { longitude: 103.79, latitude: 1.30 },
    }

    markers.setWaypoints([waypoint], onSelect)
    const button = document.querySelector<HTMLButtonElement>('.community-waypoint-marker')!
    markers.setWaypoints([revisedWaypoint], onSelect)

    expect(markerState.instances).toHaveLength(1)
    expect(markerState.instances[0]?.coordinates).toEqual([103.79, 1.30])
    expect(button.dataset.category).toBe('toilet')
    expect(button.getAttribute('aria-label')).toBe('Open details for Toilet')
    expect(button.querySelector('.community-waypoint-marker-icon svg')?.classList.contains('lucide-toilet')).toBe(true)

    markers.setWaypoints([], onSelect)
    expect(document.querySelector('.community-waypoint-marker')).toBeNull()
    expect(markerState.instances[0]?.added).toBe(false)
    button.click()
    expect(onSelect).not.toHaveBeenCalled()

    markers.dispose()
  })

  it('reuses marker identity across updates and calls the newest selection callback', () => {
    const markers = createCommunityWaypointMarkers({} as Map)
    const staleSelection = vi.fn()
    const currentSelection = vi.fn()

    markers.setWaypoints([waypoint], staleSelection)
    const button = document.querySelector<HTMLButtonElement>('.community-waypoint-marker')!
    markers.setWaypoints([{ ...waypoint }], currentSelection)
    button.click()

    expect(document.querySelector('.community-waypoint-marker')).toBe(button)
    expect(staleSelection).not.toHaveBeenCalled()
    expect(currentSelection).toHaveBeenCalledWith(waypoint.id, button)
    markers.dispose()
  })
})

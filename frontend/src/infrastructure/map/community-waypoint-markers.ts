import { Marker, type Map } from 'maplibre-gl'
import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import './community-waypoint-markers.css'

interface CommunityWaypointMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly handleClick: (event: MouseEvent) => void
  coordinate: [number, number]
  name: string
  category: CommunityWaypointCategory
}

export interface CommunityWaypointMarkers {
  setWaypoints(
    waypoints: readonly CommunityWaypoint[],
    onSelect: (waypointId: string, trigger: HTMLButtonElement) => void,
  ): void
  dispose(): void
}

const CATEGORY_TOKENS: Readonly<Record<CommunityWaypointCategory, string>> = {
  water_cooler: 'W',
  atm: 'ATM',
  toilet: 'T',
  vending_machine: 'V',
}

function getCategoryLabel(category: CommunityWaypointCategory): string {
  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.find(({ value }) => value === category)?.label ?? 'Community Waypoint'
}

function updateElement(
  element: HTMLButtonElement,
  waypoint: CommunityWaypoint,
  previous: Pick<CommunityWaypointMarkerRecord, 'name' | 'category'> | null,
): void {
  if (previous?.category !== waypoint.category) {
    element.dataset.category = waypoint.category
    const token = element.querySelector<HTMLElement>('.community-waypoint-marker-token')
    if (token) token.textContent = CATEGORY_TOKENS[waypoint.category]
  }
  if (previous === null || previous.name !== waypoint.name || previous.category !== waypoint.category) {
    element.setAttribute(
      'aria-label',
      `Open ${waypoint.name}, ${getCategoryLabel(waypoint.category)} details.`,
    )
  }
}

function createMarkerElement(waypoint: CommunityWaypoint): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'community-waypoint-marker'
  const badge = document.createElement('span')
  badge.className = 'community-waypoint-marker-badge'
  badge.setAttribute('aria-hidden', 'true')
  const token = document.createElement('span')
  token.className = 'community-waypoint-marker-token'
  badge.append(token)
  button.append(badge)
  updateElement(button, waypoint, null)
  return button
}

export function createCommunityWaypointMarkers(map: Map): CommunityWaypointMarkers {
  const markerRecords = new globalThis.Map<string, CommunityWaypointMarkerRecord>()
  let onSelect: (waypointId: string, trigger: HTMLButtonElement) => void = () => undefined
  let disposed = false

  return {
    setWaypoints(waypoints, nextOnSelect) {
      if (disposed) return
      onSelect = nextOnSelect
      const wantedIds = new Set<string>(waypoints.map(({ id }) => id))

      for (const [id, record] of markerRecords) {
        if (wantedIds.has(id)) continue
        record.element.removeEventListener('click', record.handleClick)
        record.marker.remove()
        markerRecords.delete(id)
      }

      for (const waypoint of waypoints) {
        const coordinate: [number, number] = [
          waypoint.coordinate.longitude,
          waypoint.coordinate.latitude,
        ]
        const record = markerRecords.get(waypoint.id)
        if (record) {
          updateElement(record.element, waypoint, record)
          record.name = waypoint.name
          record.category = waypoint.category
          if (record.coordinate[0] !== coordinate[0] || record.coordinate[1] !== coordinate[1]) {
            record.marker.setLngLat(coordinate)
            record.coordinate = coordinate
          }
          continue
        }

        const element = createMarkerElement(waypoint)
        const handleClick = (event: MouseEvent): void => {
          event.stopPropagation()
          if (!disposed) onSelect(waypoint.id, element)
        }
        element.addEventListener('click', handleClick)
        const marker = new Marker({ anchor: 'bottom', element }).setLngLat(coordinate).addTo(map)
        markerRecords.set(waypoint.id, {
          marker,
          element,
          handleClick,
          coordinate,
          name: waypoint.name,
          category: waypoint.category,
        })
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      onSelect = () => undefined
      for (const record of markerRecords.values()) {
        record.element.removeEventListener('click', record.handleClick)
        record.marker.remove()
      }
      markerRecords.clear()
    },
  }
}

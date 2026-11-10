import { Marker, type Map } from 'maplibre-gl'
import {
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import { createMapSvgIcon, type MapSvgIconName } from './svg-icons'
import './community-waypoint-markers.css'

interface CommunityWaypointMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly handleClick: (event: MouseEvent) => void
  coordinate: [number, number]
  displayLabel: string
  category: CommunityWaypointCategory
}

export interface CommunityWaypointMarkers {
  setWaypoints(
    waypoints: readonly CommunityWaypoint[],
    onSelect: (waypointId: string, trigger: HTMLButtonElement) => void,
  ): void
  dispose(): void
}

const CATEGORY_ICONS: Readonly<Record<CommunityWaypointCategory, MapSvgIconName>> = {
  water_cooler: 'droplets',
  atm: 'banknote',
  toilet: 'toilet',
  vending_machine: 'cup-soda',
}

function updateElement(
  element: HTMLButtonElement,
  waypoint: CommunityWaypoint,
  previous: Pick<CommunityWaypointMarkerRecord, 'displayLabel' | 'category'> | null,
): void {
  if (previous?.category !== waypoint.category) {
    element.dataset.category = waypoint.category
    const icon = element.querySelector<HTMLElement>('.community-waypoint-marker-icon')
    icon?.replaceChildren(createMapSvgIcon(CATEGORY_ICONS[waypoint.category], {
      className: 'community-waypoint-marker-glyph',
      size: 13,
    }))
  }
  if (previous === null || previous.displayLabel !== waypoint.displayLabel) {
    element.setAttribute('aria-label', `Open details for ${waypoint.displayLabel}`)
  }
}

function createMarkerElement(waypoint: CommunityWaypoint): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'community-waypoint-marker'
  button.dataset.hoverTreatment = 'custom'
  const icon = document.createElement('span')
  icon.className = 'community-waypoint-marker-icon'
  icon.setAttribute('aria-hidden', 'true')
  button.append(icon)
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
          record.displayLabel = waypoint.displayLabel
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
        const marker = new Marker({
          anchor: 'center',
          element,
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport',
        }).setLngLat(coordinate).addTo(map)
        markerRecords.set(waypoint.id, {
          marker,
          element,
          handleClick,
          coordinate,
          displayLabel: waypoint.displayLabel,
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

import { Marker, type Map } from 'maplibre-gl'
import { isValidLocationCoordinates } from '../../domain/location/coordinates'
import type { PersonalWaypoint } from '../../domain/waypoints/personal/personal-waypoint'
import './personal-waypoint-markers.css'

interface PersonalWaypointMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly handleClick: (event: MouseEvent) => void
  waypoint: PersonalWaypoint
  attached: boolean
}

export interface PersonalWaypointMarkers {
  setWaypoints(
    waypoints: readonly PersonalWaypoint[],
    visible: boolean,
    onSelect: (waypointId: string, trigger: HTMLButtonElement) => void,
  ): void
  dispose(): void
}

function createMarkerElement(waypoint: PersonalWaypoint): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'personal-waypoint-marker'
  element.setAttribute('aria-label', `Open ${waypoint.name}, ${waypoint.category} details`)
  const icon = document.createElement('span')
  icon.className = 'personal-waypoint-marker-icon'
  icon.setAttribute('aria-hidden', 'true')
  element.append(icon)
  return element
}

export function createPersonalWaypointMarkers(map: Map): PersonalWaypointMarkers {
  const markerRecords = new globalThis.Map<string, PersonalWaypointMarkerRecord>()
  let visible = false
  let onSelect: (waypointId: string, trigger: HTMLButtonElement) => void = () => undefined
  let disposed = false

  const detach = (record: PersonalWaypointMarkerRecord): void => {
    if (!record.attached) return
    record.marker.remove()
    record.attached = false
  }

  return {
    setWaypoints(waypoints, nextVisible, nextOnSelect) {
      if (disposed) return
      visible = nextVisible
      onSelect = nextOnSelect

      const validWaypoints = waypoints.filter(({ coordinate }) => (
        isValidLocationCoordinates(coordinate.longitude, coordinate.latitude)
      ))
      const wantedIds = new Set(validWaypoints.map(({ id }) => id))

      for (const [id, record] of markerRecords) {
        if (wantedIds.has(id)) continue
        record.element.removeEventListener('click', record.handleClick)
        detach(record)
        markerRecords.delete(id)
      }

      for (const waypoint of validWaypoints) {
        let record = markerRecords.get(waypoint.id)
        if (!record) {
          const element = createMarkerElement(waypoint)
          const handleClick = (event: MouseEvent): void => {
            event.stopPropagation()
            if (!visible || disposed) return
            onSelect(waypoint.id, element)
          }
          element.addEventListener('click', handleClick)
          const marker = new Marker({ anchor: 'bottom', element })
            .setLngLat([waypoint.coordinate.longitude, waypoint.coordinate.latitude])
          record = { marker, element, handleClick, waypoint, attached: false }
          markerRecords.set(waypoint.id, record)
        } else {
          record.waypoint = waypoint
          record.element.setAttribute('aria-label', `Open ${waypoint.name}, ${waypoint.category} details`)
          record.marker.setLngLat([waypoint.coordinate.longitude, waypoint.coordinate.latitude])
        }

        if (visible && !record.attached) {
          record.marker.addTo(map)
          record.attached = true
        } else if (!visible) {
          detach(record)
        }
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      visible = false
      onSelect = () => undefined
      for (const record of markerRecords.values()) {
        record.element.removeEventListener('click', record.handleClick)
        detach(record)
      }
      markerRecords.clear()
    },
  }
}

import { Marker, type Map } from 'maplibre-gl'
import { isValidLocationCoordinates } from '../../domain/location/coordinates'
import {
  PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS,
  PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS,
  type PersonalWaypoint,
  type PersonalWaypointMarkerIcon,
} from '../../domain/waypoints/personal/personal-waypoint'
import { createMapSvgIcon, type MapSvgIconName } from './svg-icons'
import './personal-waypoint-markers.css'

interface PersonalWaypointMarkerPresentation {
  readonly name: string
  readonly category: string
  readonly markerColor: PersonalWaypoint['markerColor']
  readonly markerIcon: PersonalWaypointMarkerIcon
}

interface PersonalWaypointMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly icon: HTMLSpanElement
  readonly handleClick: (event: MouseEvent) => void
  attached: boolean
  presentation: PersonalWaypointMarkerPresentation
  coordinate: [number, number]
}

export interface PersonalWaypointMarkers {
  setWaypoints(
    waypoints: readonly PersonalWaypoint[],
    visible: boolean,
    onSelect: (waypointId: string, trigger: HTMLButtonElement) => void,
  ): void
  focusWaypoint(waypoint: PersonalWaypoint): void
  dispose(): void
}

const markerSvgIconNames: Record<PersonalWaypointMarkerIcon, MapSvgIconName> = {
  dot: 'circle-dot',
  rest: 'armchair',
  food: 'coffee',
  nature: 'tree-pine',
  favorite: 'star',
}

function getMarkerPresentation(waypoint: PersonalWaypoint): PersonalWaypointMarkerPresentation {
  return {
    name: waypoint.name,
    category: waypoint.category,
    markerColor: waypoint.markerColor,
    markerIcon: waypoint.markerIcon,
  }
}

function getMarkerIconLabel(markerIcon: PersonalWaypointMarkerIcon): string {
  return PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS.find(({ value }) => value === markerIcon)?.label ?? 'General'
}

function getMarkerColorLabel(markerColor: PersonalWaypoint['markerColor']): string {
  return PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS.find(({ value }) => value === markerColor)?.label ?? 'Blue'
}

function updateMarkerElement(
  element: HTMLButtonElement,
  icon: HTMLSpanElement,
  waypoint: PersonalWaypoint,
  previous: PersonalWaypointMarkerPresentation | null,
): void {
  if (previous?.markerColor !== waypoint.markerColor) {
    element.dataset.markerColor = waypoint.markerColor
  }
  if (previous?.markerIcon !== waypoint.markerIcon) {
    element.dataset.markerIcon = waypoint.markerIcon
    const iconName = Object.prototype.hasOwnProperty.call(markerSvgIconNames, waypoint.markerIcon)
      ? markerSvgIconNames[waypoint.markerIcon]
      : 'circle-dot'
    icon.replaceChildren(createMapSvgIcon(iconName, {
      className: 'personal-waypoint-marker-glyph',
      size: 13,
    }))
  }
  if (
    previous === null ||
    previous.name !== waypoint.name ||
    previous.category !== waypoint.category ||
    previous.markerColor !== waypoint.markerColor ||
    previous.markerIcon !== waypoint.markerIcon
  ) {
    element.setAttribute(
      'aria-label',
      `Open ${waypoint.name}, ${waypoint.category} details. ${getMarkerIconLabel(waypoint.markerIcon)} icon, ${getMarkerColorLabel(waypoint.markerColor)} marker.`,
    )
  }
}

function createMarkerElement(waypoint: PersonalWaypoint): {
  readonly element: HTMLButtonElement
  readonly icon: HTMLSpanElement
} {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'personal-waypoint-marker'
  const pin = document.createElement('span')
  pin.className = 'personal-waypoint-marker-pin'
  const icon = document.createElement('span')
  icon.className = 'personal-waypoint-marker-icon'
  icon.setAttribute('aria-hidden', 'true')
  pin.append(icon)
  element.append(pin)
  updateMarkerElement(element, icon, waypoint, null)
  return { element, icon }
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

  const getOrCreateRecord = (waypoint: PersonalWaypoint): PersonalWaypointMarkerRecord => {
    const existingRecord = markerRecords.get(waypoint.id)
    if (existingRecord) {
      updateMarkerElement(existingRecord.element, existingRecord.icon, waypoint, existingRecord.presentation)
      existingRecord.presentation = getMarkerPresentation(waypoint)
      const nextCoordinate: [number, number] = [
        waypoint.coordinate.longitude,
        waypoint.coordinate.latitude,
      ]
      if (
        existingRecord.coordinate[0] !== nextCoordinate[0] ||
        existingRecord.coordinate[1] !== nextCoordinate[1]
      ) {
        existingRecord.marker.setLngLat(nextCoordinate)
        existingRecord.coordinate = nextCoordinate
      }
      return existingRecord
    }

    const { element, icon } = createMarkerElement(waypoint)
    const handleClick = (event: MouseEvent): void => {
      event.stopPropagation()
      if (!visible || disposed) return
      onSelect(waypoint.id, element)
    }
    element.addEventListener('click', handleClick)
    const coordinate: [number, number] = [waypoint.coordinate.longitude, waypoint.coordinate.latitude]
    const marker = new Marker({ anchor: 'bottom', element }).setLngLat(coordinate)
    const record = {
      marker,
      element,
      icon,
      handleClick,
      attached: false,
      presentation: getMarkerPresentation(waypoint),
      coordinate,
    }
    markerRecords.set(waypoint.id, record)
    return record
  }

  const attach = (record: PersonalWaypointMarkerRecord): void => {
    if (record.attached) return
    record.marker.addTo(map)
    record.attached = true
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
        const record = getOrCreateRecord(waypoint)

        if (visible && !record.attached) {
          attach(record)
        } else if (!visible) {
          detach(record)
        }
      }
    },

    focusWaypoint(waypoint) {
      if (disposed || !visible) return
      if (!isValidLocationCoordinates(waypoint.coordinate.longitude, waypoint.coordinate.latitude)) return
      attach(getOrCreateRecord(waypoint))
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

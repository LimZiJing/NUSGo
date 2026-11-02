import { Marker, type Map } from 'maplibre-gl'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidLocationCoordinates } from '../../domain/location/coordinates'
import {
  PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS,
  PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS,
  type PersonalWaypoint,
  type PersonalWaypointMarkerIcon,
} from '../../domain/waypoints/personal/personal-waypoint'
import {
  ArmchairIcon,
  CircleDotIcon,
  CoffeeIcon,
  FavoriteIcon,
  TreePineIcon,
  type IconProps,
} from '../../ui/icons'
import './personal-waypoint-markers.css'

interface PersonalWaypointMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly icon: HTMLSpanElement
  readonly handleClick: (event: MouseEvent) => void
  attached: boolean
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

const markerIconProps: IconProps = { className: 'personal-waypoint-marker-glyph', size: 13 }
const markerIconElements: Record<PersonalWaypointMarkerIcon, () => ReactNode> = {
  dot: () => createElement(CircleDotIcon, markerIconProps),
  rest: () => createElement(ArmchairIcon, markerIconProps),
  food: () => createElement(CoffeeIcon, markerIconProps),
  nature: () => createElement(TreePineIcon, markerIconProps),
  favorite: () => createElement(FavoriteIcon, { ...markerIconProps, filled: false }),
}

function getMarkerIconLabel(waypoint: PersonalWaypoint): string {
  return PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS.find(({ value }) => value === waypoint.markerIcon)?.label ?? 'General'
}

function getMarkerColorLabel(waypoint: PersonalWaypoint): string {
  return PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS.find(({ value }) => value === waypoint.markerColor)?.label ?? 'Blue'
}

function updateMarkerElement(
  element: HTMLButtonElement,
  icon: HTMLSpanElement,
  waypoint: PersonalWaypoint,
): void {
  element.dataset.markerColor = waypoint.markerColor
  element.dataset.markerIcon = waypoint.markerIcon
  element.setAttribute(
    'aria-label',
    `Open ${waypoint.name}, ${waypoint.category} details. ${getMarkerIconLabel(waypoint)} icon, ${getMarkerColorLabel(waypoint)} marker.`,
  )
  icon.innerHTML = renderToStaticMarkup(markerIconElements[waypoint.markerIcon]())
}

function createMarkerElement(waypoint: PersonalWaypoint): { readonly element: HTMLButtonElement; readonly icon: HTMLSpanElement } {
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
  updateMarkerElement(element, icon, waypoint)
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
      updateMarkerElement(existingRecord.element, existingRecord.icon, waypoint)
      existingRecord.marker.setLngLat([waypoint.coordinate.longitude, waypoint.coordinate.latitude])
      return existingRecord
    }

    const { element, icon } = createMarkerElement(waypoint)
    const handleClick = (event: MouseEvent): void => {
      event.stopPropagation()
      if (!visible || disposed) return
      onSelect(waypoint.id, element)
    }
    element.addEventListener('click', handleClick)
    const marker = new Marker({ anchor: 'bottom', element })
      .setLngLat([waypoint.coordinate.longitude, waypoint.coordinate.latitude])
    const record = { marker, element, icon, handleClick, attached: false }
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

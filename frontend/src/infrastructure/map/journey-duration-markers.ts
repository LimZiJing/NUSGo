import { Marker, type Map } from 'maplibre-gl'
import type { MapJourneyOption } from '../../app/contracts/map'
import { formatDuration } from '../../domain/trip/duration-format'
import type { Journey } from '../../domain/trip/journey'

const JOURNEY_DURATION_MARKER_Z_INDEX = 4
const JOURNEY_DURATION_MARKER_SPACING = 32

interface JourneyDurationMarker {
  readonly candidateKey: string
  readonly marker: Marker
  readonly element: HTMLElement
}

function haveOptionsChanged(
  current: readonly MapJourneyOption[],
  next: readonly MapJourneyOption[],
): boolean {
  return current.length !== next.length || current.some((option, index) => (
    option.candidateKey !== next[index]?.candidateKey || option.journey !== next[index]?.journey
  ))
}

function getJourneyLabelPoint(journey: Journey): [number, number] | null {
  const segments: Array<{
    readonly from: readonly [number, number]
    readonly to: readonly [number, number]
    readonly length: number
  }> = []
  let totalLength = 0

  for (const leg of journey.legs) {
    const coordinates = leg.geometry.coordinates
    for (let index = 1; index < coordinates.length; index += 1) {
      const from = coordinates[index - 1]
      const to = coordinates[index]
      const latitudeRadians = ((from[1] + to[1]) / 2) * Math.PI / 180
      const longitudeDistance = (to[0] - from[0]) * Math.cos(latitudeRadians)
      const latitudeDistance = to[1] - from[1]
      const length = Math.hypot(longitudeDistance, latitudeDistance)
      if (length <= 0) continue
      segments.push({ from, to, length })
      totalLength += length
    }
  }

  if (segments.length === 0) {
    const coordinate = journey.legs[0]?.geometry.coordinates[0]
    return coordinate ? [coordinate[0], coordinate[1]] : null
  }

  let distanceToMidpoint = totalLength / 2
  for (const segment of segments) {
    if (distanceToMidpoint <= segment.length) {
      const ratio = distanceToMidpoint / segment.length
      return [
        segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
        segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
      ]
    }
    distanceToMidpoint -= segment.length
  }

  const lastSegment = segments.at(-1)
  return lastSegment ? [lastSegment.to[0], lastSegment.to[1]] : null
}

function createDurationLabelElement(durationLabel: string, candidateKey: string): HTMLElement {
  const element = document.createElement('div')
  element.className = 'journey-duration-marker'
  element.textContent = durationLabel
  element.dataset.candidateKey = candidateKey
  element.setAttribute('aria-hidden', 'true')
  element.style.pointerEvents = 'none'
  element.style.zIndex = String(JOURNEY_DURATION_MARKER_Z_INDEX)
  return element
}

function updateMarkerSelection(
  markers: readonly JourneyDurationMarker[],
  selectedCandidateKey: string | null,
): void {
  for (const { candidateKey, element } of markers) {
    const selected = candidateKey === selectedCandidateKey
    element.classList.toggle('journey-duration-marker-selected', selected)
    element.classList.toggle('journey-duration-marker-alternative', !selected)
  }
}

function createMarkers(
  map: Map,
  options: readonly MapJourneyOption[],
): JourneyDurationMarker[] {
  const markers: JourneyDurationMarker[] = []
  try {
    options.forEach(({ candidateKey, journey }, candidateIndex) => {
      const coordinate = getJourneyLabelPoint(journey)
      if (!coordinate) return

      const element = createDurationLabelElement(
        formatDuration(journey.totalDurationSeconds),
        candidateKey,
      )
      const verticalOffset = (
        candidateIndex - (options.length - 1) / 2
      ) * JOURNEY_DURATION_MARKER_SPACING
      const marker = new Marker({
        anchor: 'center',
        element,
        offset: [0, verticalOffset],
      }).setLngLat(coordinate)
      markers.push({ candidateKey, marker, element })
      marker.addTo(map)
    })
  } catch (error) {
    markers.forEach(({ marker }) => marker.remove())
    throw error
  }
  return markers
}

export interface JourneyDurationMarkers {
  setJourneyOptions(options: readonly MapJourneyOption[], selectedCandidateKey: string | null): void
  dispose(): void
}

export function createJourneyDurationMarkers(map: Map): JourneyDurationMarkers {
  let disposed = false
  let currentOptions: readonly MapJourneyOption[] = []
  let markers: JourneyDurationMarker[] = []

  const clearMarkers = (): void => {
    markers.forEach(({ marker }) => marker.remove())
    markers = []
    currentOptions = []
  }

  return {
    setJourneyOptions(options, selectedCandidateKey) {
      if (disposed) return
      if (haveOptionsChanged(currentOptions, options)) {
        clearMarkers()
        markers = createMarkers(map, options)
        currentOptions = [...options]
      }
      updateMarkerSelection(markers, selectedCandidateKey)
    },

    dispose() {
      if (disposed) return
      disposed = true
      clearMarkers()
    },
  }
}

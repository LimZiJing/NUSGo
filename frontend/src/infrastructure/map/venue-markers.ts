import { Marker, type Map } from 'maplibre-gl'
import type { VenueLocation } from '@navus/shared/venue/types'
import { formatVenueFloor } from '../../domain/venue/details'

export const BUILDING_PART_HIGHLIGHT_COLOR = '#1d4ed8'

export interface VenueMarker {
  dispose(): void
}

export function createVenueMarker(
  map: Map,
  venue: VenueLocation,
  color = '#64748b',
): VenueMarker | null {
  if (!venue.location) return null

  // The explore panel is the canonical venue detail surface, so this marker
  // deliberately has no popup that could duplicate the panel.
  const marker = new Marker({ color })
    // Venue data stores x/y as longitude/latitude.
    .setLngLat([venue.location.x, venue.location.y])
    .addTo(map)
  const floorLabel = venue.floor === undefined || venue.floor === null
    ? null
    : formatVenueFloor(venue.floor)
  // Keep the floor chip just below the selected pin with a small visual gap.
  const floorMarker = floorLabel
    ? new Marker({
      element: createFloorLabelElement(floorLabel),
      anchor: 'top',
      offset: [0, 8],
    })
      .setLngLat([venue.location.x, venue.location.y])
      .addTo(map)
    : null
  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      floorMarker?.remove()
      marker.remove()
    },
  }
}

function createFloorLabelElement(label: string): HTMLElement {
  const element = document.createElement('span')
  element.className = 'venue-floor-map-label'
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', label)
  element.textContent = label
  return element
}

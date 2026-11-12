import { Marker, type Map } from 'maplibre-gl'
import type { VenueLocation } from '@nusgo/shared/venue/types'
import { createMapPin, MAP_PIN_ANCHOR } from './map-pin'

export interface VenueMarker {
  dispose(): void
}

export interface VenueMarkerOptions {
  /** Draws the selection halo. A selected building marks one part and leaves the rest unselected. */
  readonly selected?: boolean
  readonly label?: string
}

export function createVenueMarker(
  map: Map,
  venue: VenueLocation,
  { selected = true, label }: VenueMarkerOptions = {},
): VenueMarker | null {
  if (!venue.location) return null

  // The explore panel is the canonical venue detail surface, so this marker
  // deliberately has no popup that could duplicate the panel.
  const { element } = createMapPin({
    variant: 'location',
    selected,
    glyph: 'map-pin',
    ...(label ? { label } : {}),
  })
  const marker = new Marker({ anchor: MAP_PIN_ANCHOR, element })
    // Venue data stores x/y as longitude/latitude.
    .setLngLat([venue.location.x, venue.location.y])
    .addTo(map)
  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      marker.remove()
    },
  }
}

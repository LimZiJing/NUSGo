import { Marker, type Map } from 'maplibre-gl'
import type { VenueLocation } from '@navus/shared/venue/types'

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
  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      marker.remove()
    },
  }
}

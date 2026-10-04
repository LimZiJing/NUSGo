import { Marker, type Map } from 'maplibre-gl'
import type { VenueLocation } from '../../domain/venue/types'

export interface VenueMarker {
  dispose(): void
}

export function createVenueMarker(
  map: Map,
  venue: VenueLocation,
): VenueMarker | null {
  if (!venue.location) return null

  // The contextual panel is the canonical venue detail surface, so this marker
  // deliberately has no popup that could duplicate the panel.
  const marker = new Marker({ color: '#64748b' })
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

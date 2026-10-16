import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LayersIcon } from '../../ui/icons'
import { Marker, type Map } from 'maplibre-gl'
import type { VenueLocation } from '@navus/shared/venue/types'

export interface VenueMarker {
  dispose(): void
}

function createFloorLabelElement(floor: VenueLocation['floor']): HTMLElement | null {
  if (floor === null || floor === undefined || String(floor).trim() === '') return null

  const label = `Floor ${String(floor).trim()}`
  const element = document.createElement('span')
  const text = document.createElement('span')
  const template = document.createElement('template')
  element.className = 'venue-floor-map-label'
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', label)
  text.textContent = label
  template.innerHTML = renderToStaticMarkup(createElement(LayersIcon, { size: 12 }))
  const floorIcon = template.content.querySelector('svg')
  if (floorIcon) element.append(floorIcon)
  element.append(text)
  return element
}

export function createVenueMarker(
  map: Map,
  venue: VenueLocation,
): VenueMarker | null {
  if (!venue.location) return null

  // The explore panel is the canonical venue detail surface, so this marker
  // deliberately has no popup that could duplicate the panel.
  const coordinates: [number, number] = [venue.location.x, venue.location.y]
  const marker = new Marker({ color: '#64748b' })
    // Venue data stores x/y as longitude/latitude.
    .setLngLat(coordinates)
    .addTo(map)
  const floorLabel = createFloorLabelElement(venue.floor)
  const floorMarker = floorLabel
    ? new Marker({ element: floorLabel, anchor: 'top', offset: [0, 8] })
      .setLngLat(coordinates)
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

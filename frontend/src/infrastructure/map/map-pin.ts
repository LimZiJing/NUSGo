import { createMapSvgIcon, type MapSvgIconName } from './svg-icons'
import './map-pin.css'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/**
 * The single teardrop outline shared by selected locations, saved Personal Waypoints and
 * placement. The head is an 11-unit circle centred on (12, 12) and the outline ends on the tip at
 * exactly (12, 32), so a marker anchored at `bottom` puts the coordinate on the point itself.
 */
const MAP_PIN_TEARDROP_PATH =
  'M12 32C8.8 28.2 1 19.6 1 12A11 11 0 0 1 23 12C23 19.6 15.2 28.2 12 32Z'

/**
 * Every member of the family anchors its tip on the coordinate. Kept beside the shared outline so
 * selected-location, Personal Waypoint and placement pins cannot drift apart.
 */
export const MAP_PIN_ANCHOR = 'bottom' as const

export type MapPinVariant = 'location' | 'waypoint' | 'placement' | 'destination'

export interface MapPinElement {
  readonly element: HTMLElement
  /** The glyph slot inside the pin head. Callers fill it with the icon they need. */
  readonly glyph: HTMLSpanElement
}

interface CreateMapPinOptions {
  readonly variant: MapPinVariant
  /** Accessible name. Omit for a decorative pin such as the draggable placement marker. */
  readonly label?: string
  /** Render a keyboard-activatable button instead of a presentational element. */
  readonly interactive?: boolean
  /** Draws the soft selection halo and the modestly larger pin body. */
  readonly selected?: boolean
  /** Shared icon drawn inside the pin head. */
  readonly glyph?: MapSvgIconName
}

function createTeardrop(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 24 32')
  svg.setAttribute('class', 'map-pin-teardrop')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute('d', MAP_PIN_TEARDROP_PATH)
  svg.append(path)
  return svg
}

/**
 * Builds one member of the shared teardrop pin family. MapLibre still owns marker creation,
 * listeners and cleanup; this only builds the element handed to a marker.
 */
export function createMapPin({
  variant,
  label,
  interactive = false,
  selected = false,
  glyph,
}: CreateMapPinOptions): MapPinElement {
  const element = interactive ? document.createElement('button') : document.createElement('div')
  if (interactive) (element as HTMLButtonElement).type = 'button'
  element.className = 'map-pin'
  element.dataset.variant = variant
  if (selected) element.dataset.selected = 'true'
  if (label) {
    element.setAttribute('aria-label', label)
    if (!interactive) element.setAttribute('role', 'img')
  } else {
    element.setAttribute('aria-hidden', 'true')
  }

  const pin = document.createElement('span')
  pin.className = 'map-pin-pin'
  pin.append(createTeardrop())

  const glyphElement = document.createElement('span')
  glyphElement.className = 'map-pin-glyph'
  if (glyph) {
    glyphElement.append(createMapSvgIcon(glyph, {
      className: 'map-pin-glyph-icon',
      size: variant === 'location' ? 11 : 14,
      strokeWidth: glyph === 'crosshair' ? 2.4 : 2,
    }))
  }
  pin.append(glyphElement)

  element.append(pin)
  return { element, glyph: glyphElement }
}

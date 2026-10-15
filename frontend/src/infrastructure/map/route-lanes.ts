import type { LineLayerSpecification } from 'maplibre-gl'

// Zoom stops for each selected-route lane, in px. The offset is half the lane
// width plus a small gap so the two directions of an out-and-back section sit
// side by side; negative is left of travel (see
// createSelectedRouteOffsetExpression). Arrows sit slightly wider than the lane
// but inside the casing.
export const SELECTED_ROUTE_LANE_STOPS = [
  { zoom: 12, width: 2, arrowWidth: 3.5, casingWidth: 5, offset: -1.75 },
  { zoom: 15, width: 4, arrowWidth: 5.5, casingWidth: 7, offset: -2.75 },
  { zoom: 18, width: 5.5, arrowWidth: 7, casingWidth: 8.5, offset: -3.5 },
] as const

export type LineWidthSpecification = NonNullable<LineLayerSpecification['paint']>['line-width']

export const DIRECTION_IMAGE_PIXEL_RATIO = 2
const DIRECTION_IMAGE_HEIGHT = 12
// MapLibre scales a line pattern's height to the line width and keeps its
// aspect ratio, so a chevron repeats every eight lane-widths along the lane.
const DIRECTION_IMAGE_WIDTH = DIRECTION_IMAGE_HEIGHT * 8
const DIRECTION_CHEVRON_THICKNESS = 3

/**
 * Builds a white `>` chevron on a transparent tile. The pattern runs along the
 * line in its coordinate order, so the chevron always points in travel
 * direction and follows the offset lane through bends.
 */
export function createDirectionChevronImage(): { width: number; height: number; data: Uint8Array } {
  const width = DIRECTION_IMAGE_WIDTH
  const height = DIRECTION_IMAGE_HEIGHT
  const data = new Uint8Array(width * height * 4)
  const halfHeight = height / 2
  const tipX = Math.round(width / 2 + halfHeight / 2)
  for (let y = 0; y < height; y += 1) {
    const distanceFromCentre = Math.abs(y + 0.5 - halfHeight)
    const armRight = tipX - Math.floor(distanceFromCentre)
    for (let x = armRight - DIRECTION_CHEVRON_THICKNESS; x < armRight; x += 1) {
      const offset = (y * width + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}

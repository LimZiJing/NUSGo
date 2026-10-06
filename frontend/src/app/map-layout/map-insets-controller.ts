import {
  calculateMapOverlayInsets,
  type MapOverlayMeasurements,
} from '../map-camera'
import type { MapViewportInsets } from '../contracts/map'

export interface MapViewportInsetsSink {
  setViewportInsets(insets: MapViewportInsets): void
}

/** Bridges measured overlay geometry to the application-facing map seam. */
export function applyMapOverlayMeasurements(
  sink: MapViewportInsetsSink,
  measurements: MapOverlayMeasurements,
): MapViewportInsets {
  const insets = calculateMapOverlayInsets(measurements)
  sink.setViewportInsets(insets)
  return insets
}

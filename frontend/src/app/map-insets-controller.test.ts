import { describe, expect, it, vi } from 'vitest'
import { applyMapOverlayMeasurements } from './map-insets-controller'

describe('map overlay measurement seam', () => {
  it('passes ResizeObserver-style measurements to the map viewport inset command', () => {
    const setViewportInsets = vi.fn()
    const insets = applyMapOverlayMeasurements(
      { setViewportInsets },
      {
        viewportWidth: 390,
        viewportHeight: 844,
        tripCardHeight: 92,
        activeSheetHeight: 196,
        tripCardVisible: true,
        activeSheetVisible: true,
        desktopNavigationWidth: 0,
      },
    )

    expect(setViewportInsets).toHaveBeenCalledWith(insets)
    expect(insets).toEqual({ top: 104, right: 12, bottom: 208, left: 12 })
  })

  it('reserves the measured desktop navigation column', () => {
    const setViewportInsets = vi.fn()
    applyMapOverlayMeasurements(
      { setViewportInsets },
      {
        viewportWidth: 769,
        viewportHeight: 900,
        tripCardHeight: 320,
        activeSheetHeight: 280,
        tripCardVisible: true,
        activeSheetVisible: true,
        desktopNavigationWidth: 360,
      },
    )

    expect(setViewportInsets).toHaveBeenCalledWith({ top: 0, right: 0, bottom: 0, left: 372 })
  })
})

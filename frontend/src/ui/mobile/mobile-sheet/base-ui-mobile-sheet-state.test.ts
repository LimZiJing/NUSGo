import { describe, expect, it } from 'vitest'
import {
  createBaseUiMobileSheetSnapPoints,
  createBaseUiMobileSheetSnapPointsFromHeights,
  getBaseUiMobileSheetDetent,
  getBaseUiMobileSheetSnapPoint,
} from './base-ui-mobile-sheet-state'

describe('Base UI mobile sheet snap points', () => {
  it('preserves the original sheet detent heights when measured from its layout', () => {
    const points = createBaseUiMobileSheetSnapPointsFromHeights([44, 286.5, 568])

    expect(points).toEqual(['44px', '286.5px', '568px'])
  })

  it('uses the existing collapsed, partial, and full sheet heights', () => {
    const points = createBaseUiMobileSheetSnapPoints(1000, 80, 44)

    expect(points).toEqual(['44px', '520px', '920px'])
  })

  it('keeps snap points within the visible height on short viewports', () => {
    const points = createBaseUiMobileSheetSnapPoints(300, 80, 44)

    expect(points).toEqual(['44px', '100px', '220px'])
  })

  it('maps Base UI snap point changes to navigation detents', () => {
    const points = createBaseUiMobileSheetSnapPoints(1000, 80, 44)

    expect(getBaseUiMobileSheetSnapPoint('partial', points)).toBe('520px')
    expect(getBaseUiMobileSheetDetent('920px', points)).toBe('full')
    expect(getBaseUiMobileSheetDetent(null, points)).toBe('collapsed')
  })
})

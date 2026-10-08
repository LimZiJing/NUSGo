import { describe, expect, it } from 'vitest'
import {
  createBaseUiMobileSheetSnapPoints,
  getBaseUiMobileSheetDetent,
  getBaseUiMobileSheetSnapPoint,
} from './base-ui-mobile-sheet-state'

describe('Base UI mobile sheet snap points', () => {
  it('keeps the closed handle above the tab bar and gives partial 50% of the viewport', () => {
    const points = createBaseUiMobileSheetSnapPoints(1000, 80, 44)

    expect(points).toEqual(['124px', '580px', '1000px'])
    expect(Number.parseFloat(points[0]) - 80).toBe(44)
    expect(Number.parseFloat(points[1]) - 80).toBe(500)
  })

  it('uses the whole short viewport for full expansion', () => {
    const points = createBaseUiMobileSheetSnapPoints(300, 80, 44)

    expect(points).toEqual(['124px', '230px', '300px'])
  })

  it('maps Base UI snap point changes to navigation detents', () => {
    const points = createBaseUiMobileSheetSnapPoints(1000, 80, 44)

    expect(getBaseUiMobileSheetSnapPoint('partial', points)).toBe('580px')
    expect(getBaseUiMobileSheetDetent('1000px', points)).toBe('full')
    expect(getBaseUiMobileSheetDetent(null, points)).toBe('collapsed')
  })
})

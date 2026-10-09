import { describe, expect, it } from 'vitest'
import { getMobileSheetHeights, getMobileTabBarInset } from './mobile-sheet-layout'

describe('mobile sheet layout', () => {
  it('includes the pill navigation bottom gutter in the occupied sheet inset', () => {
    const inset = getMobileTabBarInset(844, { top: 772, height: 56 }, 72)

    expect(inset).toBe(72)
    expect(getMobileSheetHeights(844, inset).partialMaxHeight).toBeCloseTo(434.4)
  })

  it('keeps the CSS inset when the pill navigation is hidden or unavailable', () => {
    expect(getMobileTabBarInset(844, { top: 0, height: 0 }, 72)).toBe(72)
    expect(getMobileTabBarInset(844, null, 72)).toBe(72)
  })

  it('keeps the sheet and bottom tab bar inside the 60% viewport cap', () => {
    expect(getMobileSheetHeights(800, 76)).toEqual({
      viewportHeight: 800,
      partialMaxHeight: 404,
    })
  })

  it('never produces negative height when the tab bar exceeds the viewport cap', () => {
    expect(getMobileSheetHeights(100, 80)).toMatchObject({
      partialMaxHeight: 0,
    })
  })
})

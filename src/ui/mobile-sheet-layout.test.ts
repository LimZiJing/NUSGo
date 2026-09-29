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
      combinedHeightCap: 480,
      partialMaxHeight: 404,
      partialMinHeight: 200,
    })
  })

  it('uses the 200px floor when the 60% combined cap allows it', () => {
    expect(getMobileSheetHeights(700, 72).partialMinHeight).toBe(200)
  })

  it('reduces the sheet floor to fit short and keyboard-reduced viewports', () => {
    expect(getMobileSheetHeights(500, 76)).toMatchObject({
      partialMaxHeight: 224,
      partialMinHeight: 200,
    })
    expect(getMobileSheetHeights(300, 76)).toMatchObject({
      partialMaxHeight: 104,
      partialMinHeight: 104,
    })
  })

  it('never produces negative height when the tab bar exceeds the viewport cap', () => {
    expect(getMobileSheetHeights(100, 80)).toMatchObject({
      partialMaxHeight: 0,
      partialMinHeight: 0,
    })
  })
})

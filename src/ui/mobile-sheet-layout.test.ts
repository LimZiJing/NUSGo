import { describe, expect, it } from 'vitest'
import { getMobileSheetHeights } from './mobile-sheet-layout'

describe('mobile sheet layout', () => {
  it('keeps the sheet and bottom tab bar inside the 40% viewport cap', () => {
    expect(getMobileSheetHeights(800, 76)).toEqual({
      viewportHeight: 800,
      combinedHeightCap: 320,
      partialMaxHeight: 244,
      partialMinHeight: 200,
    })
  })

  it('uses the 200px floor when the combined cap allows it', () => {
    expect(getMobileSheetHeights(700, 72).partialMinHeight).toBe(200)
  })

  it('reduces the sheet floor to fit short and keyboard-reduced viewports', () => {
    expect(getMobileSheetHeights(500, 76)).toMatchObject({
      partialMaxHeight: 124,
      partialMinHeight: 124,
    })
    expect(getMobileSheetHeights(300, 76)).toMatchObject({
      partialMaxHeight: 44,
      partialMinHeight: 44,
    })
  })

  it('never produces negative height when the tab bar exceeds the viewport cap', () => {
    expect(getMobileSheetHeights(100, 80)).toMatchObject({
      partialMaxHeight: 0,
      partialMinHeight: 0,
    })
  })
})

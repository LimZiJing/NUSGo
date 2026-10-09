import { describe, expect, it } from 'vitest'
import {
  createMobileSheetSnapPoints,
  getMobileSheetDetent,
  getMobileSheetSnapPoint,
} from './mobile-sheet-snap-points'

describe('mobile sheet snap points', () => {
  it('keeps the closed handle above the tab bar and gives partial 50% of the viewport', () => {
    const points = createMobileSheetSnapPoints(1000, 80, 44)

    expect(points).toEqual(['124px', '580px', '1000px'])
    expect(Number.parseFloat(points[0]) - 80).toBe(44)
    expect(Number.parseFloat(points[1]) - 80).toBe(500)
  })

  it('uses the whole short viewport for full expansion', () => {
    const points = createMobileSheetSnapPoints(300, 80, 44)

    expect(points).toEqual(['124px', '230px', '300px'])
  })

  it('maps snap point changes to navigation detents', () => {
    const points = createMobileSheetSnapPoints(1000, 80, 44)

    expect(getMobileSheetSnapPoint('partial', points)).toBe('580px')
    expect(getMobileSheetDetent('1000px', points)).toBe('full')
    expect(getMobileSheetDetent(null, points)).toBe('collapsed')
  })
})

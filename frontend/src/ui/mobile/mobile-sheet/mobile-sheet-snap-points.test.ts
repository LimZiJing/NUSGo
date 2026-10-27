import { describe, expect, it } from 'vitest'
import {
  createMobileSheetSnapPoints,
  getMobileSheetOccupiedHeight,
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

  it('supports a short content-height partial sheet for the More menu', () => {
    const points = createMobileSheetSnapPoints(1000, 80, 44, 192)

    expect(points).toEqual(['124px', '272px', '1000px'])
    expect(Number.parseFloat(points[1]) - 80).toBe(192)
  })

  it('maps snap point changes to navigation detents', () => {
    const points = createMobileSheetSnapPoints(1000, 80, 44)

    expect(getMobileSheetSnapPoint('partial', points)).toBe('580px')
    expect(getMobileSheetDetent('1000px', points)).toBe('full')
    expect(getMobileSheetDetent(null, points)).toBe('collapsed')
    expect(getMobileSheetDetent('580px', points)).toBe('partial')
    expect(getMobileSheetDetent('124px', points)).toBe('collapsed')
  })

  it('does not mistake a snap point from an earlier viewport size for full', () => {
    const points = createMobileSheetSnapPoints(844, 80, 44)

    expect(getMobileSheetDetent('580px', points)).toBeNull()
  })

  it('matches near-equal snap points that differ only by sub-pixel rounding', () => {
    const points = createMobileSheetSnapPoints(844, 80, 44)

    expect(getMobileSheetDetent('502.4px', points)).toBe('partial')
    expect(getMobileSheetDetent('843.6px', points)).toBe('full')
    expect(getMobileSheetDetent('124.0000001px', points)).toBe('collapsed')
    expect(getMobileSheetDetent(502.3, points)).toBe('partial')
  })

  it('ignores unparseable or distant snap points', () => {
    const points = createMobileSheetSnapPoints(844, 80, 44)

    expect(getMobileSheetDetent('50%', points)).toBeNull()
    expect(getMobileSheetDetent(Number.NaN, points)).toBeNull()
    expect(getMobileSheetDetent('502.9px', points)).toBe('partial')
    expect(getMobileSheetDetent('510px', points)).toBeNull()
  })

  it('reports the height a detent occupies above the bottom of the map', () => {
    const points = createMobileSheetSnapPoints(1000, 80, 44)

    expect(getMobileSheetOccupiedHeight('collapsed', points)).toBe(124)
    expect(getMobileSheetOccupiedHeight('partial', points)).toBe(580)
    expect(getMobileSheetOccupiedHeight('full', points)).toBe(1000)
  })
})

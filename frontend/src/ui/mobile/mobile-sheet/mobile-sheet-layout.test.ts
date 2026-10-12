import { describe, expect, it } from 'vitest'
import { getMobileTabBarInset } from './mobile-sheet-layout'

describe('mobile sheet layout', () => {
  it('includes the pill navigation bottom gutter in the occupied sheet inset', () => {
    expect(getMobileTabBarInset(844, { top: 772, height: 56 })).toBe(72)
  })

  it('reports no inset when the tab bar is hidden, unavailable or unmeasurable', () => {
    expect(getMobileTabBarInset(844, { top: 0, height: 0 })).toBe(0)
    expect(getMobileTabBarInset(844, null)).toBe(0)
    expect(getMobileTabBarInset(Number.NaN, { top: 772, height: 56 })).toBe(0)
  })

  it('never reports a negative inset', () => {
    expect(getMobileTabBarInset(700, { top: 772, height: 56 })).toBe(0)
  })
})

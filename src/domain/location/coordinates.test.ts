import { describe, expect, it } from 'vitest'
import { isValidLocationCoordinates } from './coordinates'

describe('location coordinates', () => {
  it('accepts valid longitude and latitude boundaries', () => {
    expect(isValidLocationCoordinates(-180, -90)).toBe(true)
    expect(isValidLocationCoordinates(180, 90)).toBe(true)
    expect(isValidLocationCoordinates(103.784413, 1.29482)).toBe(true)
  })

  it('rejects non-finite and out-of-range coordinates', () => {
    expect(isValidLocationCoordinates(Number.NaN, 1)).toBe(false)
    expect(isValidLocationCoordinates(103, Number.POSITIVE_INFINITY)).toBe(false)
    expect(isValidLocationCoordinates(-180.001, 1)).toBe(false)
    expect(isValidLocationCoordinates(103, 90.001)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { parseCoordinateInput } from './parse-coordinate-input'

const valid = { latitude: 1.2966, longitude: 103.7764 }

describe('parseCoordinateInput', () => {
  it.each([
    ['Google Maps paste', '1.2966, 103.7764'],
    ['no space after comma', '1.2966,103.7764'],
    ['space separator only', '1.2966 103.7764'],
    ['extra whitespace', '  1.2966 ,   103.7764  '],
    ['explicit plus sign', '+1.2966, +103.7764'],
  ])('accepts %s', (_name, input) => {
    expect(parseCoordinateInput(input)).toEqual({ ok: true, coordinate: valid, outsideSingapore: false })
  })

  it('accepts negative values and boundaries', () => {
    expect(parseCoordinateInput('-90, -180')).toMatchObject({ ok: true, coordinate: { latitude: -90, longitude: -180 } })
    expect(parseCoordinateInput('90, 180')).toMatchObject({ ok: true })
  })

  it('reports a swapped pair as a latitude error', () => {
    expect(parseCoordinateInput('103.7764, 1.2966')).toMatchObject({ ok: false, error: 'latitude-out-of-range' })
  })

  it('reports an out-of-range longitude', () => {
    expect(parseCoordinateInput('1.2966, 180.5')).toMatchObject({ ok: false, error: 'longitude-out-of-range' })
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['one number', '1.2966'],
    ['non-numeric', 'abc, def'],
    ['comma decimal pair', '1,2966; 103,7764'],
    ['three numbers', '1.2, 103.7, 5'],
    ['degree symbol', '1.2966°, 103.7764°'],
    ['compass suffix', '1.2966 N, 103.7764 E'],
    ['double comma', '1.2966,, 103.7764'],
  ])('rejects %s as unreadable', (_name, input) => {
    expect(parseCoordinateInput(input)).toMatchObject({ ok: false, error: 'unreadable' })
  })

  it('never mistakes a comma decimal for a coordinate', () => {
    // "1,2966" reads as latitude 1 and longitude 2966, which is out of range.
    expect(parseCoordinateInput('1,2966')).toMatchObject({ ok: false, error: 'longitude-out-of-range' })
  })

  it('accepts a valid point outside Singapore with a warning flag', () => {
    expect(parseCoordinateInput('51.5072, -0.1276')).toEqual({
      ok: true,
      coordinate: { latitude: 51.5072, longitude: -0.1276 },
      outsideSingapore: true,
    })
  })

  it('gives plain messages on failure', () => {
    const result = parseCoordinateInput('nope')
    expect(result.ok === false && result.message).toContain('1.2966, 103.7764')
  })
})

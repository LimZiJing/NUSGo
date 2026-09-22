import { describe, expect, it } from 'vitest'
import { getValhallaBaseUrl } from './routing-config'

describe('getValhallaBaseUrl', () => {
  it('uses the public development endpoint when no local endpoint is configured', () => {
    expect(getValhallaBaseUrl(undefined, true)).toBe('https://valhalla1.openstreetmap.de')
  })

  it('keeps an explicitly configured endpoint in development', () => {
    expect(getValhallaBaseUrl('http://localhost:8002/', true)).toBe('http://localhost:8002/')
  })

  it('keeps the existing local default outside development', () => {
    expect(getValhallaBaseUrl(undefined, false)).toBe('http://localhost:8002')
  })
})

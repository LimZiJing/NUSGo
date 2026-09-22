import { describe, expect, it } from 'vitest'
import { getValhallaBaseUrl } from './routing-config'

describe('getValhallaBaseUrl', () => {
  it('uses the local Vite proxy when no endpoint is configured in development', () => {
    expect(getValhallaBaseUrl(undefined, true)).toBe('/valhalla')
  })

  it('keeps an explicitly configured endpoint in development', () => {
    expect(getValhallaBaseUrl('http://localhost:8002/', true)).toBe('http://localhost:8002/')
  })

  it('keeps the existing local default outside development', () => {
    expect(getValhallaBaseUrl(undefined, false)).toBe('http://localhost:8002')
  })
})

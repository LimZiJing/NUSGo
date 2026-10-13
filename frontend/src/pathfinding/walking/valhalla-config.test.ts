import { describe, expect, it } from 'vitest'
import { getValhallaBaseUrl } from './valhalla-config'

describe('getValhallaBaseUrl', () => {
  it('uses the local Vite proxy when no endpoint is configured in development', () => {
    expect(getValhallaBaseUrl(undefined, true)).toBe('/valhalla')
  })

  it('uses the local Vite proxy for an explicitly configured local endpoint', () => {
    expect(getValhallaBaseUrl('http://localhost:8002/', true)).toBe('/valhalla')
  })

  it('keeps an explicitly configured remote endpoint in development', () => {
    expect(getValhallaBaseUrl('https://routing.example.test', true)).toBe('https://routing.example.test')
  })

  it('keeps the existing local default outside development', () => {
    expect(getValhallaBaseUrl(undefined, false)).toBe('http://localhost:8002')
  })
})

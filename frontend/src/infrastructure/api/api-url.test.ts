import { describe, expect, it } from 'vitest'
import { buildApiUrl } from './api-url'

describe('buildApiUrl', () => {
  it('uses the configured Express origin for API paths', () => {
    expect(buildApiUrl('/api/shuttle-arrivals', 'https://api.example.test'))
      .toBe('https://api.example.test/api/shuttle-arrivals')
  })

  it('keeps API paths root-relative when no origin is configured', () => {
    expect(buildApiUrl('/api/shuttle-arrivals', ''))
      .toBe('/api/shuttle-arrivals')
  })
})

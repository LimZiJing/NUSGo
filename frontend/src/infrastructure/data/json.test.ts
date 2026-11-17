import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBasePathUrl } from './json'

afterEach(() => vi.unstubAllEnvs())

describe('buildBasePathUrl', () => {
  it('keeps public asset links inside a prefixed app deployment', () => {
    vi.stubEnv('BASE_URL', '/NUSGo/')

    expect(buildBasePathUrl('/data/community-waypoints.geojson'))
      .toBe('/NUSGo/data/community-waypoints.geojson')
  })
})

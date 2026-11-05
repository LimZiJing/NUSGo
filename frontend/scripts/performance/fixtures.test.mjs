// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installFixtures } from './fixtures.mjs'
import { parseApiJourneyPlanningResponse } from '../../../shared/src/routing/validation.ts'
import { selectDisplayedJourneyOptions } from '../../src/features/plan/data/displayed-journey-options.ts'

const originalFetch = window.fetch
const geolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
afterEach(() => {
  window.fetch = originalFetch
  if (geolocation) Object.defineProperty(navigator, 'geolocation', geolocation)
  else delete navigator.geolocation
  delete window.nusgoFixtureLocation
  delete window.nusgoFixtureStats
  vi.restoreAllMocks()
})

it('loads a complete, displayable Path through the real response and ranking boundaries', async () => {
  window.fetch = vi.fn(() => { throw new Error('Unexpected live network request') })
  installFixtures({ stops: [
    { id: 'COM3', longitude: 103.775217, latitude: 1.294431 },
    { id: 'UTOWN', longitude: 103.774621, latitude: 1.303876 },
  ] })
  const response = await window.fetch('http://127.0.0.1:3001/api/journeys', {
    body: JSON.stringify({ origin: { kind: 'stop', id: 'COM3' }, destination: { kind: 'stop', id: 'UTOWN' } }),
  })
  const result = parseApiJourneyPlanningResponse(await response.json())
  expect(result?.outcome).toBe('paths')
  const displayed = selectDisplayedJourneyOptions(result.candidates)
  expect(displayed).toHaveLength(1)
  expect(displayed[0].path.legs[0].geometry.coordinates).toHaveLength(1000)
  expect(displayed[0].path.legs[0].geometry.coordinates[0]).toEqual([103.775217, 1.294431])
  expect(displayed[0].path.legs[0].geometry.coordinates.at(-1)).toEqual([103.774621, 1.303876])
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { describe, expect, it } from 'vitest'
import { AboutSection } from './about-section'

afterEach(cleanup)

describe('About settings', () => {
  it('shows available data provenance and linked map credits', () => {
    render(
      <AboutSection
        dataVersion="2026.10.23"
        transitMetadata={{
          source: 'NUSMods routes and stops',
          routeStopOrder: 'Curated stop order',
          routeGeometry: 'Reviewed map geometry',
          verifiedAt: '2026-10-20',
          routeOrderSource: 'NUSMods',
          coordinateSource: 'NUS API',
        }}
        buildingSource={{
          name: 'NUS Digital Twin (City Syntax Lab)',
          url: 'https://www.nus-digital-twin.com/api/v1/buildings',
          fetchedOn: '2026-10-13',
          licenceNote: 'Source credit',
        }}
      />,
    )

    expect(screen.getByText('2026.10.23')).toBeTruthy()
    expect(screen.getByText(/Verified 2026-10-20/)).toBeTruthy()
    expect(screen.getByText(/Route geometry: Reviewed map geometry/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'NUS Digital Twin (City Syntax Lab)' }).getAttribute('href'))
      .toBe('https://www.nus-digital-twin.com/api/v1/buildings')
    expect(screen.getByRole('link', { name: 'OpenMapTiles' }).getAttribute('href'))
      .toBe('https://openmaptiles.org/')
    expect(screen.getByRole('link', { name: 'OpenStreetMap' }).getAttribute('href'))
      .toBe('https://www.openstreetmap.org/copyright')
    expect(screen.getByRole('link', { name: 'LTA DataMall' }).getAttribute('href'))
      .toBe('https://datamall.lta.gov.sg/content/datamall/en.html')
  })

  it('omits unavailable transit and building source details', () => {
    render(<AboutSection dataVersion="local" transitMetadata={null} buildingSource={null} />)

    expect(screen.getByText('local')).toBeTruthy()
    expect(screen.queryByText('Bus network')).toBeNull()
    expect(screen.queryByText('Buildings')).toBeNull()
  })
})

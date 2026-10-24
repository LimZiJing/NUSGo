// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AboutSection } from './about-section'

afterEach(cleanup)

describe('About settings', () => {
  it('groups sources, version, and feedback into compact sections', () => {
    render(
      <AboutSection
        dataVersion="development"
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
          licenceNote: 'Sourced from OpenStreetMap and Google Maps by City Syntax Lab researchers. Some locations use unverified entrances.',
        }}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'About NavUS' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Data sources' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'App version' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Help & feedback' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Credits' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'UI inspiration' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'NUS NextBus' }).getAttribute('href'))
      .toBe('https://bus.hewliyang.com/')
    expect(screen.getByRole('link', { name: 'Hew Liyang' }).getAttribute('href'))
      .toBe('https://github.com/hewliyang/nus-nextbus-web')
    expect(screen.getByRole('heading', { name: 'Bus timings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Live arrivals' })).toBeNull()
    expect(screen.queryByText('NUS buses · NavUS')).toBeNull()
    expect(screen.getByText('NUSMods routes and stops · Updated 20 Oct 2026')).toBeTruthy()
    expect(screen.getByText('Updated 13 Oct 2026')).toBeTruthy()
    expect(screen.getByText('Data from OpenStreetMap and Google Maps.')).toBeTruthy()
    expect(screen.getByText('Some locations are provisional.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Venue data' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'NUSMods' }).getAttribute('href')).toBe('https://nusmods.com')
    expect(screen.getByRole('link', { name: 'NUS Digital Twin · City Syntax Lab' }).getAttribute('href'))
      .toBe('https://www.nus-digital-twin.com/api/v1/buildings')
    expect(screen.getByRole('link', { name: 'OpenFreeMap' }).getAttribute('href'))
      .toBe('https://openfreemap.org/')
    const openStreetMapLinks = screen.getAllByRole('link', { name: 'OpenStreetMap' })
    expect(openStreetMapLinks).toHaveLength(1)
    expect(openStreetMapLinks.every((link) => link.getAttribute('href') === 'https://www.openstreetmap.org/copyright'))
      .toBe(true)
    expect(screen.getByRole('link', { name: 'Public buses · LTA DataMall' }).getAttribute('href'))
      .toBe('https://datamall.lta.gov.sg/content/datamall/en.html')
    expect(screen.getByText('Development')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send feedback' }).getAttribute('href'))
      .toBe('https://github.com/LimZiJing/NUSGo/issues/new')
  })

  it('omits unavailable transit and building source details', () => {
    render(<AboutSection dataVersion={'b'.repeat(40)} transitMetadata={null} buildingSource={null} />)

    expect(screen.queryByText('Bus network')).toBeNull()
    expect(screen.queryByText('Building locations')).toBeNull()
    expect(screen.getByText('Production · bbbbbbb')).toBeTruthy()
  })
})

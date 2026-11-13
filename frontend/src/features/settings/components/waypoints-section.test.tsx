// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WaypointsSection } from './waypoints-section'

afterEach(cleanup)

describe('Waypoints settings', () => {
  it('offers the approved Community Waypoint GeoJSON at the app base path', () => {
    render(<WaypointsSection communityWaypointDownloadUrl="/NUSGo/data/community-waypoints.geojson" />)

    const link = screen.getByRole('link', { name: 'Download approved community waypoints' })
    expect(screen.getByRole('heading', { name: 'Community waypoints' })).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/NUSGo/data/community-waypoints.geojson')
    expect(link.getAttribute('download')).toBe('community-waypoints.geojson')
    expect(link.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Download approved community waypoints')).toBeTruthy()
    expect(screen.queryByText('Download the reviewed public waypoint dataset.')).toBeNull()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { CommunityWaypointPanel } from './community-waypoint-panel'
import { useCommunityWaypointDiscovery, type CommunityWaypointLoader } from './use-community-waypoint-discovery'

const waypoints: readonly CommunityWaypoint[] = [
  {
    id: 'cw-water-001',
    name: 'Water cooler at UTown',
    category: 'water_cooler',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    source: 'NUS Campus Facilities',
    updatedAt: '2026-10-26',
    building: 'Stephen Riady Centre',
    floor: 1,
    details: 'Beside the east stairwell.',
    accessibilityNote: 'Reachable without stairs.',
  },
  {
    id: 'cw-atm-001',
    name: 'ATM at Central Library',
    category: 'atm',
    coordinate: { longitude: 103.77, latitude: 1.30 },
    source: 'NUS Campus Facilities',
    updatedAt: '2026-10-25',
  },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function DiscoveryHarness({
  load,
  onSelectWaypoint = () => undefined,
  onSuggestCorrection = () => undefined,
}: {
  readonly load: CommunityWaypointLoader
  readonly onSelectWaypoint?: (id: string) => void
  readonly onSuggestCorrection?: (id: string) => void
}) {
  const discovery = useCommunityWaypointDiscovery(load)
  return (
    <CommunityWaypointPanel
      discovery={discovery}
      onSelectWaypoint={onSelectWaypoint}
      onSuggestCorrection={onSuggestCorrection}
    />
  )
}

describe('CommunityWaypointPanel', () => {
  it('filters approved places and restores keyboard focus after opening details', async () => {
    const user = userEvent.setup()
    const load = vi.fn(async () => waypoints)
    const onSelectWaypoint = vi.fn()
    const onSuggestCorrection = vi.fn()
    render(<DiscoveryHarness load={load} onSelectWaypoint={onSelectWaypoint} onSuggestCorrection={onSuggestCorrection} />)

    await screen.findByRole('button', { name: /Water cooler at UTown/ })
    expect(screen.getByRole('button', { name: /ATM at Central Library/ })).toBeTruthy()
    const waterFilter = screen.getByRole('button', { name: 'Water cooler, 1 place' })
    expect(waterFilter.getAttribute('aria-pressed')).toBe('true')
    await user.click(waterFilter)

    expect(screen.queryByRole('button', { name: /Water cooler at UTown/ })).toBeNull()
    expect(screen.getByRole('button', { name: /ATM at Central Library/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'ATM, 1 place' }))
    expect(screen.getByText(/No places match these categories/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show all' }))

    const row = screen.getByRole('button', { name: /Water cooler at UTown/ })
    await user.click(row)
    expect(onSelectWaypoint).toHaveBeenCalledWith('cw-water-001')
    expect(screen.getByRole('heading', { name: 'Water cooler at UTown' })).toBeTruthy()
    expect(screen.getByText('Stephen Riady Centre · Floor 1')).toBeTruthy()
    expect(screen.getByText('Beside the east stairwell.')).toBeTruthy()
    expect(screen.getByText('Reachable without stairs.')).toBeTruthy()
    expect(screen.getByText('NUS Campus Facilities')).toBeTruthy()
    expect(screen.getByText('2026-10-26').tagName).toBe('TIME')

    await user.click(screen.getByRole('button', { name: 'Suggest a correction' }))
    expect(onSuggestCorrection).toHaveBeenCalledWith('cw-water-001')
    expect(screen.getByRole('status').textContent).toBe('Correction submissions are not open yet.')

    await user.click(screen.getByRole('button', { name: 'Community places' }))
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('shows a useful empty state after the approved collection loads with no places', async () => {
    render(<DiscoveryHarness load={async () => []} />)

    expect(await screen.findByText(/No approved Community Waypoints yet/)).toBeTruthy()
    const filters = screen.getByRole('group', { name: 'Filter by category' })
    expect(within(filters).getAllByRole('button')).toHaveLength(4)
  })

  it('offers retry when approved data fails to load', async () => {
    const user = userEvent.setup()
    const loadError = new Error('network unavailable')
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = vi.fn<CommunityWaypointLoader>()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce(waypoints)
    render(<DiscoveryHarness load={load} />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(logError).toHaveBeenCalledWith('Community waypoint load failed:', loadError)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', {
      name: 'Water cooler at UTown, Water cooler. Open details.',
    })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

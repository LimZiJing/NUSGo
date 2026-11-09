// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { CommunityWaypointPanel } from './community-waypoint-panel'
import { useCommunityWaypointDiscovery, type CommunityWaypointLoader } from './use-community-waypoint-discovery'

const waypoints: readonly CommunityWaypoint[] = [
  {
    id: 'cw-water-001',
    displayLabel: 'Water cooler · Stephen Riady Centre · Floor 1 · Beside the east stairwell.',
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
    displayLabel: 'ATM',
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
  onSuggestWaypoint = () => undefined,
}: {
  readonly load: CommunityWaypointLoader
  readonly onSelectWaypoint?: (id: string) => void
  readonly onSuggestCorrection?: (id: string, trigger: HTMLButtonElement) => void
  readonly onSuggestWaypoint?: (trigger: HTMLButtonElement) => void
}) {
  const discovery = useCommunityWaypointDiscovery(load)
  return (
    <CommunityWaypointPanel
      discovery={discovery}
      onSelectWaypoint={onSelectWaypoint}
      onSuggestCorrection={onSuggestCorrection}
      onSuggestWaypoint={onSuggestWaypoint}
    />
  )
}

describe('CommunityWaypointPanel', () => {
  it('filters approved Community Waypoints and restores keyboard focus after opening details', async () => {
    const user = userEvent.setup()
    const load = vi.fn(async () => waypoints)
    const onSelectWaypoint = vi.fn()
    const onSuggestCorrection = vi.fn()
    render(<DiscoveryHarness load={load} onSelectWaypoint={onSelectWaypoint} onSuggestCorrection={onSuggestCorrection} />)

    await screen.findByRole('button', {
      name: 'Open details for Water cooler · Stephen Riady Centre · Floor 1 · Beside the east stairwell.',
    })
    expect(screen.getByRole('button', { name: 'Open details for ATM' })).toBeTruthy()
    const waterFilter = screen.getByRole('button', { name: 'Water cooler, 1 waypoint' })
    expect(waterFilter.getAttribute('aria-pressed')).toBe('true')
    await user.click(waterFilter)

    expect(screen.queryByRole('button', { name: /Open details for Water cooler/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open details for ATM' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'ATM, 1 waypoint' }))
    expect(screen.getByText('No matches.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show all waypoints' }))

    const row = screen.getByRole('button', { name: /Open details for Water cooler/ })
    await user.click(row)
    expect(onSelectWaypoint).toHaveBeenCalledWith('cw-water-001')
    expect(screen.getByRole('heading', { name: waypoints[0]?.displayLabel })).toBeTruthy()
    expect(screen.getByText('Stephen Riady Centre · Floor 1')).toBeTruthy()
    expect(screen.getByText('Beside the east stairwell.')).toBeTruthy()
    expect(screen.getByText('Reachable without stairs.')).toBeTruthy()
    expect(screen.getByText('NUS Campus Facilities')).toBeTruthy()
    expect(screen.getByText('2026-10-26').tagName).toBe('TIME')

    await user.click(screen.getByRole('button', { name: 'Suggest a correction' }))
    expect(onSuggestCorrection).toHaveBeenCalledWith('cw-water-001', expect.any(HTMLButtonElement))
    expect(onSuggestCorrection.mock.calls[0][1]).toBeInstanceOf(HTMLButtonElement)
    expect(screen.queryByText('Correction submissions are not open yet.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Community Waypoints' }))
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('offers one direct action instead of empty filters when no Community Waypoints are approved', async () => {
    const user = userEvent.setup()
    const onSuggestWaypoint = vi.fn()
    render(<DiscoveryHarness load={async () => []} onSuggestWaypoint={onSuggestWaypoint} />)

    expect(await screen.findByText('Know a useful campus location? Suggest it for others.')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filter by category' })).toBeNull()
    const suggestButton = screen.getByRole('button', { name: 'Suggest a waypoint' })
    await user.click(suggestButton)
    expect(onSuggestWaypoint).toHaveBeenCalledWith(suggestButton)
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
      name: 'Open details for Water cooler · Stephen Riady Centre · Floor 1 · Beside the east stairwell.',
    })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

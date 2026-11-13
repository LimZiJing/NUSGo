// @vitest-environment jsdom

import { useEffect, useRef } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import { CommunityWaypointPanel } from './community-waypoint-panel'
import { useCommunityWaypointDiscovery, type CommunityWaypointLoader } from './use-community-waypoint-discovery'

const waypoints: readonly CommunityWaypoint[] = [
  {
    id: 'cw-water-001',
    displayLabel: 'Water cooler · Stephen Riady Centre · Floor 1',
    category: 'water_cooler',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    source: 'NUS Campus Facilities',
    updatedAt: '2026-10-26',
    building: 'Stephen Riady Centre',
    floor: 1,
    details: 'Beside the east stairwell.',
  },
  {
    id: 'cw-printing-001',
    displayLabel: 'Printing / photocopying',
    category: 'printing',
    coordinate: { longitude: 103.77, latitude: 1.30 },
    source: 'NUS Campus Facilities',
    updatedAt: '2026-10-25',
  },
]

const VISIBILITY_KEY = 'navus:community-waypoint-visible-categories:v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

function DiscoveryHarness({
  load,
  onSuggestCorrection = () => undefined,
  onSuggestWaypoint = () => undefined,
  onVisibleWaypointsChange,
  selectWaypointOnMount,
}: {
  readonly load: CommunityWaypointLoader
  readonly onSuggestCorrection?: (id: string, trigger: HTMLButtonElement) => void
  readonly onSuggestWaypoint?: (trigger: HTMLButtonElement) => void
  readonly onVisibleWaypointsChange?: (waypoints: readonly CommunityWaypoint[]) => void
  readonly selectWaypointOnMount?: string
}) {
  const discovery = useCommunityWaypointDiscovery(load)
  const { selectWaypoint } = discovery
  const mapMarkerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (selectWaypointOnMount) {
      selectWaypoint(selectWaypointOnMount, mapMarkerRef.current ?? undefined)
    }
  }, [selectWaypoint, selectWaypointOnMount])

  useEffect(() => {
    onVisibleWaypointsChange?.(discovery.visibleWaypoints)
  }, [discovery.visibleWaypoints, onVisibleWaypointsChange])

  return (
    <>
      <button ref={mapMarkerRef} type="button">Mock map marker</button>
      <CommunityWaypointPanel
        discovery={discovery}
        onSuggestCorrection={onSuggestCorrection}
        onSuggestWaypoint={onSuggestWaypoint}
      />
    </>
  )
}

describe('CommunityWaypointPanel', () => {
  it('persists category visibility as soon as a category is toggled', async () => {
    const user = userEvent.setup()
    const onVisibleWaypointsChange = vi.fn()
    render(
      <DiscoveryHarness
        load={async () => waypoints}
        onVisibleWaypointsChange={onVisibleWaypointsChange}
      />,
    )

    const waterSwitch = await screen.findByRole('switch', { name: 'Show Water cooler on map' })
    expect(screen.queryByText(/waypoints across/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save Community Waypoint categories' })).toBeNull()
    expect(waterSwitch.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Show Printing / photocopying on map' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('list', { name: 'Approved Community Waypoints' })).toBeNull()

    await user.click(waterSwitch)
    expect(waterSwitch.getAttribute('aria-checked')).toBe('true')
    expect(onVisibleWaypointsChange.mock.calls.at(-1)?.[0]).toEqual([waypoints[0]])
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('["water_cooler"]')

    await user.click(waterSwitch)
    expect(onVisibleWaypointsChange.mock.calls.at(-1)?.[0]).toEqual([])
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('[]')
  })

  it('offers one waypoint suggestion action at the bottom of the panel', async () => {
    const user = userEvent.setup()
    const onSuggestWaypoint = vi.fn()
    render(<DiscoveryHarness load={async () => []} onSuggestWaypoint={onSuggestWaypoint} />)

    const switches = await screen.findAllByRole('switch')
    expect(switches).toHaveLength(4)
    expect(screen.queryByText(/waypoints across/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Suggest .+ location$/ })).toBeNull()
    const suggestButton = screen.getByRole('button', { name: 'Suggest a waypoint' })
    await user.click(suggestButton)
    expect(onSuggestWaypoint).toHaveBeenCalledWith(suggestButton)
  })

  it('keeps the category names available to assistive technology without a visible heading', async () => {
    render(<DiscoveryHarness load={async () => waypoints} />)

    expect(await screen.findByRole('heading', { name: 'Community Waypoints' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Categories' })).toBeTruthy()
  })

  it('reports invalid saved visibility without blocking further changes', async () => {
    const user = userEvent.setup()
    localStorage.setItem(VISIBILITY_KEY, '["unknown_category"]')
    render(<DiscoveryHarness load={async () => waypoints} />)

    expect(await screen.findByText(
      'Saved category visibility could not be read. Review the categories and save to replace it.',
    )).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save Community Waypoint categories' })).toBeNull()

    const waterSwitch = screen.getByRole('switch', { name: 'Show Water cooler on map' })
    await user.click(waterSwitch)
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('["water_cooler"]')
    expect(screen.queryByText(
      'Saved category visibility could not be read. Review the categories and save to replace it.',
    )).toBeNull()
  })

  it('keeps a failed preference write retryable', async () => {
    const user = userEvent.setup()
    render(<DiscoveryHarness load={async () => waypoints} />)

    const waterSwitch = await screen.findByRole('switch', { name: 'Show Water cooler on map' })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    })
    await user.click(waterSwitch)

    expect(screen.getByText('Category visibility is saved for this session only.')).toBeTruthy()
    expect(waterSwitch.getAttribute('aria-checked')).toBe('true')

    await user.click(waterSwitch)
    await user.click(waterSwitch)

    expect(localStorage.getItem(VISIBILITY_KEY)).toBe('["water_cooler"]')
    expect(screen.queryByText('Category visibility is saved for this session only.')).toBeNull()
  })

  it('opens marker details and restores focus to the marker after Back', async () => {
    const user = userEvent.setup()
    const onSuggestCorrection = vi.fn()
    render(
      <DiscoveryHarness
        load={async () => waypoints}
        onSuggestCorrection={onSuggestCorrection}
        selectWaypointOnMount="cw-water-001"
      />,
    )

    expect(await screen.findByRole('heading', {
      name: waypoints[0]?.displayLabel,
    })).toBeTruthy()
    expect(screen.getByText('Stephen Riady Centre')).toBeTruthy()
    const detailPanel = screen.getByRole('region', { name: waypoints[0]?.displayLabel })
    expect(within(detailPanel).getByText('Water cooler')).toBeTruthy()
    expect(screen.getByText('Floor 1')).toBeTruthy()
    expect(screen.getByText('Beside the east stairwell.')).toBeTruthy()
    expect(screen.queryByText('Accessibility')).toBeNull()
    expect(screen.getByText('NUS Campus Facilities')).toBeTruthy()
    expect(screen.getByText('2026-10-26').tagName).toBe('TIME')

    await user.click(screen.getByRole('button', { name: 'Suggest a correction' }))
    expect(onSuggestCorrection).toHaveBeenCalledWith('cw-water-001', expect.any(HTMLButtonElement))

    const backButton = screen.getByRole('button', { name: 'Community Waypoints' })
    await user.click(backButton)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mock map marker' })))
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
    expect(await screen.findByRole('switch', { name: 'Show Water cooler on map' })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

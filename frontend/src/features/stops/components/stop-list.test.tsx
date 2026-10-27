// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StopListEntry } from '../data/stop-list-data'
import { StopList } from './stop-list'

afterEach(cleanup)

const entries: readonly StopListEntry[] = [
  {
    stop: {
      id: 'STOP-PUBLIC',
      longName: 'Museum',
      oppositeStop: null,
      departures: [],
      scheduledDepartures: [],
      publicServices: [{ serviceNumber: '151', timings: null, status: 'provider-error' }],
      live: false,
      liveArrivalMessage: null,
    },
    distanceMeters: 440,
    favorite: false,
    expanded: true,
  },
  {
    stop: {
      id: 'STOP-INTERNAL',
      longName: 'University Town',
      oppositeStop: null,
      departures: [],
      scheduledDepartures: [{
        routeId: 'A1',
        routeName: 'A1',
        routeColor: '#123456',
        message: 'First bus in 6m',
      }],
      publicServices: [],
      live: false,
      liveArrivalMessage: null,
    },
    distanceMeters: 160,
    favorite: false,
    expanded: true,
  },
]

describe('StopList', () => {
  it('shows one no-live-data notice, hides empty public and internal states, and keeps internal schedules', () => {
    render(
      <StopList
        entries={entries}
        selectedStopList="nearby"
        loading={false}
        locationNotice={null}
        noLiveData
        liveArrivalMessage="Live times unavailable"
        onSelectStopList={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onSelectRoute={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByText('Live times unavailable')).toBeTruthy()
    expect(screen.getByText('Museum')).toBeTruthy()
    expect(screen.getByText('University Town')).toBeTruthy()
    expect(screen.getByText('First bus in 6m')).toBeTruthy()
    expect(screen.queryByText('151')).toBeNull()
    expect(screen.queryByText('No live timing')).toBeNull()
    expect(screen.queryByText('Live timing unavailable')).toBeNull()
    expect(screen.queryByText('No bus timings available.')).toBeNull()
  })

  it('keeps favourite stops on the standard cards without list management controls', () => {
    render(
      <StopList
        entries={entries}
        selectedStopList="favourites"
        loading={false}
        locationNotice={null}
        noLiveData={false}
        liveArrivalMessage={null}
        onSelectStopList={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onSelectRoute={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add Museum, bus stop to favourites' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Edit .* favourite stops/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })
})

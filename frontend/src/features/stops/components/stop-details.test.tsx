// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StopDetailsModel } from '../data/stop-details-model.ts'
import { StopDetails } from './stop-details.tsx'

afterEach(cleanup)

const stop: StopDetailsModel = {
  id: 'SR7',
  longName: 'University Hall',
  oppositeStop: null,
  publicServices: [],
  departures: [],
  scheduledDepartures: [],
  live: false,
  pollState: 'idle',
  liveArrivalMessage: null,
}

function renderStopDetails(backLabel?: string, onBackToStops = vi.fn(), model: StopDetailsModel = stop) {
  return render(
    <StopDetails
      stop={model}
      favorite={false}
      liveArrivalMessage={null}
      backLabel={backLabel}
      onBackToStops={onBackToStops}
      onSelectOppositeStop={vi.fn()}
      onSelectRoute={vi.fn()}
      onNavigateToStop={vi.fn()}
      onToggleFavorite={vi.fn()}
    />,
  )
}

describe('StopDetails Back button', () => {
  it('defaults to "Back to stops" when no label is supplied', () => {
    renderStopDetails()

    expect(screen.getByRole('button', { name: 'Back to stops' })).toBeTruthy()
  })

  it('uses the supplied label and still calls onBackToStops', async () => {
    const user = userEvent.setup()
    const onBackToStops = vi.fn()
    renderStopDetails('Back to Find venue', onBackToStops)

    expect(screen.queryByRole('button', { name: 'Back to stops' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to Find venue' }))

    expect(onBackToStops).toHaveBeenCalledOnce()
  })
})

describe('StopDetails live status pill', () => {
  it('shows no pill when there are no live times', () => {
    renderStopDetails()

    expect(screen.queryByText('LIVE')).toBeNull()
    expect(screen.queryByText('RETRYING')).toBeNull()
  })

  it('shows a pulsing LIVE pill while a refresh is in flight', () => {
    renderStopDetails(undefined, vi.fn(), { ...stop, live: true, pollState: 'refreshing' })

    const pill = screen.getByText('LIVE')
    expect(pill.getAttribute('data-tone')).toBe('success')
    expect(pill.getAttribute('data-pulse')).toBe('true')
  })

  it('shows a red RETRYING pill when polling keeps failing', () => {
    renderStopDetails(undefined, vi.fn(), { ...stop, live: true, pollState: 'failing' })

    const pill = screen.getByText('RETRYING')
    expect(pill.getAttribute('data-tone')).toBe('error')
    expect(screen.queryByText('LIVE')).toBeNull()
  })
})

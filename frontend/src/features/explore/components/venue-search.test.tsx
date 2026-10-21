// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import { EMPTY_BUILDING_INDEX } from '../../../domain/venue/building-index'
import { linkVenuesToBuildings } from '../../../domain/venue/building-links'
import { VenueSearch } from './venue-search'

afterEach(cleanup)

// STOP-A is named "Stop A"; the venue below is also named "Stop A" but must stay its own result.
const venues: VenueLocationMap = { 'STOP-LAB': { roomName: 'Stop A' } }
const transitIndex = createTransitIndex(createValidTransitNetwork())

function renderSearch(query: string) {
  const onSelect = vi.fn()
  const onStopSelect = vi.fn()
  render(
    <VenueSearch
      venues={venues}
      buildings={EMPTY_BUILDING_INDEX}
      buildingLinks={linkVenuesToBuildings(venues, EMPTY_BUILDING_INDEX)}
      transitIndex={transitIndex}
      query={query}
      minimized={false}
      inputRef={createRef<HTMLInputElement>()}
      onQueryChange={vi.fn()}
      onSelect={onSelect as never}
      onBuildingSelect={vi.fn()}
      onStopSelect={onStopSelect as never}
    />,
  )
  return { onSelect, onStopSelect }
}

describe('VenueSearch stop results', () => {
  it('renders a stop with the bus icon, accessible label and focus id', () => {
    renderSearch('stop a')

    const stopButton = screen.getByRole('button', { name: 'Stop A, bus stop, code STOP-A' })
    expect(stopButton.dataset.focusId).toBe('stop-result-STOP-A')
    expect(stopButton.querySelector('.location-identity-icon--stop')).not.toBeNull()
    expect(stopButton.textContent).toContain('Stop A')
    // Short name differs from the ID, so it is shown with the ID as secondary text.
    expect(stopButton.textContent).toContain('A, STOP-A')
  })

  it('calls onStopSelect with the stop ID and not onSelect', () => {
    const { onSelect, onStopSelect } = renderSearch('stop a')

    fireEvent.click(screen.getByRole('button', { name: 'Stop A, bus stop, code STOP-A' }))

    expect(onStopSelect).toHaveBeenCalledOnce()
    expect(onStopSelect.mock.calls[0]?.[0]).toBe('STOP-A')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps a same-named venue as its own result and selects only the venue for it', () => {
    const { onSelect, onStopSelect } = renderSearch('stop a')

    const venueButton = screen.getByRole('button', { name: 'STOP-LAB, venue, Stop A' })
    expect(venueButton.dataset.focusId).toBe('venue-result-STOP-LAB')
    fireEvent.click(venueButton)

    expect(onSelect).toHaveBeenCalledOnce()
    expect((onSelect.mock.calls[0]?.[0] as { code: string }).code).toBe('STOP-LAB')
    expect(onStopSelect).not.toHaveBeenCalled()
  })
})

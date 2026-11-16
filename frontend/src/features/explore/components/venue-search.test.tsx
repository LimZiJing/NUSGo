// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EateryCategory, VenueLocationMap } from '@nusgo/shared/venue/types'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import { EMPTY_BUILDING_INDEX } from '../../../domain/venue/building-index'
import { linkVenuesToBuildings } from '../../../domain/venue/building-links'
import { VenueSearch } from './venue-search'

afterEach(cleanup)

// STOP-A is named "Stop A"; the venue below is also named "Stop A" but must stay its own result.
const venues: VenueLocationMap = {
  'STOP-LAB': { roomName: 'Stop A' },
  'yih-central-square': {
    roomName: 'YIH (Central Square)',
    displayName: 'YIH (Central Square)',
    category: 'canteen',
    location: { x: 103.77477, y: 1.2985 },
  },
  'starbucks-cde': {
    roomName: 'Starbucks (CDE)',
    displayName: 'Starbucks (CDE)',
    category: 'drinks & snacks',
    location: { x: 103.77, y: 1.29 },
  },
  'wild-skew': {
    roomName: 'Wild Skew',
    displayName: 'Wild Skew',
    category: 'restaurant',
    location: { x: 103.77, y: 1.29 },
  },
}
const transitIndex = createTransitIndex(createValidTransitNetwork())

function renderSearch(query: string, eateryCategory: 'all' | EateryCategory = 'all') {
  const onSelect = vi.fn()
  const onStopSelect = vi.fn()
  const onEateryCategoryChange = vi.fn()
  render(
    <VenueSearch
      venues={venues}
      buildings={EMPTY_BUILDING_INDEX}
      buildingLinks={linkVenuesToBuildings(venues, EMPTY_BUILDING_INDEX)}
      transitIndex={transitIndex}
      query={query}
      eateryCategory={eateryCategory}
      minimized={false}
      inputRef={createRef<HTMLInputElement>()}
      onQueryChange={vi.fn()}
      onEateryCategoryChange={onEateryCategoryChange}
      onSelect={onSelect as never}
      onBuildingSelect={vi.fn()}
      onStopSelect={onStopSelect as never}
    />,
  )
  return { onSelect, onStopSelect, onEateryCategoryChange }
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

  it('browses eateries in the selected category without listing bus stops or rooms', () => {
    renderSearch('', 'canteen')

    const eatery = screen.getByRole('button', { name: 'YIH (Central Square), Canteen' })
    expect(eatery.dataset.focusId).toBe('venue-result-yih-central-square')
    expect(eatery.querySelector('.location-identity-icon--eatery')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Stop A, bus stop/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Starbucks (CDE), Drinks & snacks' })).toBeNull()
  })

  it('browses restaurant destinations by friendly name', () => {
    renderSearch('', 'restaurant')

    expect(screen.getByRole('button', { name: 'Wild Skew, Restaurant' })).toBeTruthy()
  })

  it('searches within the selected category and passes through category changes', () => {
    const { onEateryCategoryChange } = renderSearch('cde', 'drinks & snacks')

    expect(screen.getByRole('button', { name: 'Starbucks (CDE), Drinks & snacks' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'YIH (Central Square), Canteen' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Place category Drinks & snacks' }))
    fireEvent.click(screen.getByRole('option', { name: 'Canteens' }))
    expect(onEateryCategoryChange).toHaveBeenCalledWith('canteen')
  })
})

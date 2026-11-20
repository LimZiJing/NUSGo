// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VenueMap } from '@nusgo/shared/venue/types'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import { EMPTY_BUILDING_INDEX } from '../../../domain/venue/building-index'
import { linkVenuesToBuildings } from '../../../domain/venue/building-links'
import { VenueSearch } from './venue-search'

afterEach(cleanup)

const venues: VenueMap = {
  'STOP-LAB': { kind: 'room', roomName: 'Stop A' },
  'yih-central-square': {
    kind: 'food', name: 'YIH (Central Square)', foodType: 'canteen', location: { x: 103.77477, y: 1.2985 },
  },
  'starbucks-cde': {
    kind: 'food', name: 'Starbucks (CDE)', foodType: 'drinks & snacks', location: { x: 103.77, y: 1.29 },
  },
  'wild-skew': {
    kind: 'food', name: 'Wild Skew', foodType: 'restaurant', location: { x: 103.77, y: 1.29 },
  },
}
const transitIndex = createTransitIndex(createValidTransitNetwork())

function renderSearch(query: string, filter: 'all' | 'food' | 'room' | 'building' | 'stop' = 'all') {
  const onSelect = vi.fn()
  const onStopSelect = vi.fn()
  const onFilterChange = vi.fn()
  render(
    <VenueSearch
      venues={venues}
      buildings={EMPTY_BUILDING_INDEX}
      buildingLinks={linkVenuesToBuildings(venues, EMPTY_BUILDING_INDEX)}
      transitIndex={transitIndex}
      query={query}
      filter={filter}
      minimized={false}
      inputRef={createRef<HTMLInputElement>()}
      onQueryChange={vi.fn()}
      onFilterChange={onFilterChange}
      onSelect={onSelect as never}
      onBuildingSelect={vi.fn()}
      onStopSelect={onStopSelect as never}
    />,
  )
  return { onSelect, onStopSelect, onFilterChange }
}

describe('VenueSearch', () => {
  it('renders a stop with the bus icon, accessible label and focus id', () => {
    renderSearch('stop a')
    const stopButton = screen.getByRole('button', { name: 'Stop A, bus stop, code STOP-A' })
    expect(stopButton.dataset.focusId).toBe('stop-result-STOP-A')
    expect(stopButton.querySelector('.location-identity-icon--stop')).not.toBeNull()
    expect(stopButton.textContent).toContain('A, STOP-A')
  })

  it('keeps a same-named Room as its own result', () => {
    const { onSelect, onStopSelect } = renderSearch('stop a')
    const roomButton = screen.getByRole('button', { name: 'STOP-LAB, room, Stop A' })
    expect(roomButton.dataset.focusId).toBe('venue-result-STOP-LAB')
    expect(roomButton.querySelector('.location-identity-icon--venue')).not.toBeNull()
    fireEvent.click(roomButton)
    expect(onSelect).toHaveBeenCalledOnce()
    expect((onSelect.mock.calls[0]?.[0] as { code: string }).code).toBe('STOP-LAB')
    expect(onStopSelect).not.toHaveBeenCalled()
  })

  it.each([
    ['yih', 'YIH (Central Square), Canteen', 'lucide-cooking-pot'],
    ['starbucks', 'Starbucks (CDE), Drinks & snacks', 'lucide-coffee'],
    ['wild skew', 'Wild Skew, Restaurant', 'lucide-utensils'],
  ])('searches Food by name and type: %s', (query, accessibleName, iconClass) => {
    renderSearch(query)
    const food = screen.getByRole('button', { name: accessibleName })
    expect(food.dataset.focusId).toContain('venue-result-')
    expect(food.querySelector('.location-identity-icon--food')).not.toBeNull()
    expect(food.querySelector(`.${iconClass}`)).not.toBeNull()
  })

  it('defaults the place filter to All places', () => {
    renderSearch('')
    expect(screen.getByRole('combobox', { name: 'Filter places: All places' })).toBeTruthy()
    expect(screen.getByText('Search for a place or bus stop')).toBeTruthy()
  })

  it('shows the selected filter in the compact trigger name and active state', () => {
    renderSearch('', 'food')
    const trigger = screen.getByRole('combobox', { name: 'Filter places: Food & beverage' })
    expect(trigger.parentElement?.className).toContain('explore-content-filter-control--active')
    expect(trigger.parentElement?.querySelectorAll('svg')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Canteen|Drinks & snacks|Restaurant/ })).toHaveLength(3)
  })

})

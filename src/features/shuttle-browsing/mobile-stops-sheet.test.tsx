// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileStopsSheet } from './mobile-stops-sheet'

afterEach(cleanup)

describe('MobileStopsSheet', () => {
  it('offers an accessible grab handle to expand the map-based Stops sheet', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const { rerender } = render(
      <MobileStopsSheet
        expanded={false}
        selectedStop={null}
        onExpandedChange={onExpandedChange}
        onSetEndpoint={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Expand Stops panel' })
    expect(toggle.getAttribute('aria-controls')).toBe('mobile-stops-sheet-content')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    rerender(
      <MobileStopsSheet
        expanded
        selectedStop={null}
        onExpandedChange={onExpandedChange}
        onSetEndpoint={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Collapse Stops panel' }).getAttribute('aria-expanded'))
      .toBe('true')
    expect(screen.getByText('Tap a shuttle stop on the map to view its details and route actions.'))
      .toBeTruthy()
  })

  it('shows the selected stop, route services and endpoint actions', async () => {
    const user = userEvent.setup()
    const onSetEndpoint = vi.fn()
    const selectedStop = {
      id: 'SR7',
      longName: 'University Hall',
      oppositeStopId: 'SR8',
      publicServices: ['PUB:95'],
      services: [
        { id: 'D2', name: 'D2', color: '#6e1d72' },
        { id: 'A1', name: 'A1', color: '#0b7258' },
      ],
    }

    render(
      <MobileStopsSheet
        expanded
        selectedStop={selectedStop}
        onExpandedChange={vi.fn()}
        onSetEndpoint={onSetEndpoint}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Stop · SR7' })).toBeTruthy()
    expect(screen.getByText('University Hall')).toBeTruthy()
    expect(screen.getByText('Opposite stop: SR8')).toBeTruthy()
    expect(screen.getByText('Public services: PUB:95')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Shuttle route services' })).toBeTruthy()
    expect(screen.getByText('D2')).toBeTruthy()
    expect(screen.getByText('A1')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Set University Hall as origin' }))
    await user.click(screen.getByRole('button', { name: 'Set University Hall as destination' }))

    expect(onSetEndpoint).toHaveBeenNthCalledWith(1, 'origin', 'SR7')
    expect(onSetEndpoint).toHaveBeenNthCalledWith(2, 'destination', 'SR7')
  })
})

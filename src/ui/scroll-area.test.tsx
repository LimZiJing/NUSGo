// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScrollArea } from './scroll-area'

afterEach(cleanup)

describe('ScrollArea', () => {
  it('defaults to a vertical scroll area and preserves its content', () => {
    render(<ScrollArea data-testid="scroll-area">Scrollable content</ScrollArea>)

    const scrollArea = screen.getByTestId('scroll-area')
    expect(scrollArea.classList.contains('ui-scroll-area')).toBe(true)
    expect(scrollArea.classList.contains('ui-scroll-area-vertical')).toBe(true)
    expect(scrollArea.textContent).toBe('Scrollable content')
  })

  it('supports horizontal scrolling and caller classes', () => {
    render(
      <ScrollArea axis="horizontal" className="route-chip-list" data-testid="scroll-area">
        <button type="button">Route A1</button>
      </ScrollArea>,
    )

    const scrollArea = screen.getByTestId('scroll-area')
    expect(scrollArea.classList.contains('ui-scroll-area-horizontal')).toBe(true)
    expect(scrollArea.classList.contains('route-chip-list')).toBe(true)
    expect(screen.getByRole('button', { name: 'Route A1' })).toBeTruthy()
  })
})

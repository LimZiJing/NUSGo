// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileSheetHandle } from './mobile-sheet-handle'
import type { MobileSheetDetent } from './mobile-sheet-detent'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MobileSheetHandle', () => {
  it('cycles through detents with an accessible button', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('collapsed')
      return (
        <section aria-label="Stops panel">
          <div id="stops-content">Stops content</div>
          <MobileSheetHandle
            detent={detent}
            label="Stops panel"
            controlsId="stops-content"
            onDetentChange={setDetent}
          />
        </section>
      )
    }

    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Expand Stops panel' })

    expect(handle.getAttribute('aria-controls')).toBe('stops-content')
    expect(handle.getAttribute('aria-expanded')).toBe('false')
    await user.click(handle)
    expect(screen.getByRole('button', { name: 'Expand Stops panel' }).getAttribute('aria-expanded'))
      .toBe('true')
    await user.click(screen.getByRole('button', { name: 'Expand Stops panel' }))
    expect(screen.getByRole('button', { name: 'Collapse Stops panel' }).getAttribute('aria-expanded'))
      .toBe('true')
    await user.click(screen.getByRole('button', { name: 'Collapse Stops panel' }))
    expect(screen.getByRole('button', { name: 'Expand Stops panel' }).getAttribute('aria-expanded'))
      .toBe('false')
  })

  it('restores the last open detent from collapsed', async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    render(
      <MobileSheetHandle
        detent="collapsed"
        restoreDetent="full"
        label="Stops panel"
        controlsId="stops-content"
        onDetentChange={onDetentChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Expand Stops panel' }))

    expect(onDetentChange).toHaveBeenCalledWith('full')
  })

  it('moves focus to the handle before collapsing focused content', async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    render(
      <>
        <div id="stops-content"><input aria-label="Stop search" /></div>
        <MobileSheetHandle
          detent="full"
          label="Stops panel"
          controlsId="stops-content"
          onDetentChange={onDetentChange}
        />
      </>,
    )
    await user.click(screen.getByRole('textbox', { name: 'Stop search' }))
    const handle = screen.getByRole('button', { name: 'Collapse Stops panel' })

    await user.click(handle)

    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
    expect(document.activeElement).toBe(handle)
  })

  it('shows the summary on the collapsed handle and includes it in the accessible name', () => {
    render(
      <MobileSheetHandle
        detent="collapsed"
        label="Stops panel"
        summary="Stops · 20 nearby"
        controlsId="stops-content"
        onDetentChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand Stops panel, Stops · 20 nearby' })).toBeTruthy()
    expect(document.querySelector('.mobile-sheet-summary-title')?.textContent).toBe('Stops')
    expect(document.querySelector('.mobile-sheet-summary-detail')?.textContent).toBe('20 nearby')
  })

  it('hides the summary once the sheet is open', () => {
    render(
      <MobileSheetHandle
        detent="partial"
        label="Stops panel"
        summary="Stops · 20 nearby"
        controlsId="stops-content"
        onDetentChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand Stops panel' })).toBeTruthy()
    expect(document.querySelector('.mobile-sheet-summary')).toBeNull()
  })
})

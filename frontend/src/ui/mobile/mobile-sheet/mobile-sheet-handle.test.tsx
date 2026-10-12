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
  function renderHandle(detent: MobileSheetDetent) {
    const onDetentChange = vi.fn()
    render(
      <>
        <div id="stops-content"><input aria-label="Stop search" /></div>
        <MobileSheetHandle
          detent={detent}
          label="Stops panel"
          controlsId="stops-content"
          onDetentChange={onDetentChange}
        />
      </>,
    )
    return onDetentChange
  }

  it('toggles between partial and full when tapped', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('partial')
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
    expect(handle.getAttribute('aria-expanded')).toBe('true')
    await user.click(handle)
    expect(screen.getByRole('button', { name: 'Reduce Stops panel' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Reduce Stops panel' }))
    expect(screen.getByRole('button', { name: 'Expand Stops panel' })).toBeTruthy()
  })

  it('expands to partial from collapsed and never collapses on tap', async () => {
    const user = userEvent.setup()
    const onDetentChange = renderHandle('collapsed')
    const handle = screen.getByRole('button', { name: 'Expand Stops panel' })

    expect(handle.getAttribute('aria-expanded')).toBe('false')
    await user.click(handle)

    expect(onDetentChange).toHaveBeenCalledExactlyOnceWith('partial')
  })

  it('operates with Enter and Space like a tap', async () => {
    const user = userEvent.setup()
    const onDetentChange = renderHandle('partial')
    screen.getByRole('button', { name: 'Expand Stops panel' }).focus()

    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onDetentChange.mock.calls).toEqual([['full'], ['full']])
  })

  it('moves one detent per arrow key and stops at the ends', async () => {
    const user = userEvent.setup()
    const expectations: ReadonlyArray<[MobileSheetDetent, string, MobileSheetDetent | null]> = [
      ['collapsed', '{ArrowUp}', 'partial'],
      ['partial', '{ArrowUp}', 'full'],
      ['full', '{ArrowUp}', null],
      ['full', '{ArrowDown}', 'partial'],
      ['partial', '{ArrowDown}', 'collapsed'],
      ['collapsed', '{ArrowDown}', null],
    ]

    for (const [detent, key, expected] of expectations) {
      const onDetentChange = renderHandle(detent)
      screen.getByRole('button', { name: /Stops panel/ }).focus()

      await user.keyboard(key)

      expect(onDetentChange.mock.calls).toEqual(expected ? [[expected]] : [])
      cleanup()
    }
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

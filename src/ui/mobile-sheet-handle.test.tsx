// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileSheetHandle } from './mobile-sheet-handle'
import type { MobileSheetDetent } from './mobile-sheet-detent'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function createRect(height: number): DOMRect {
  return {
    x: 0,
    y: 844 - height,
    width: 320,
    height,
    top: 844 - height,
    right: 320,
    bottom: 844,
    left: 0,
    toJSON: () => undefined,
  }
}

function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  options: { readonly pointerId: number; readonly clientY: number; readonly button?: number },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientY: options.clientY,
  })
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    isPrimary: { value: true },
  })
  element.dispatchEvent(event)
}

function renderHandle(detent: MobileSheetDetent, onDetentChange = vi.fn()) {
  render(
    <>
      <section aria-label="Stops panel" data-mobile-sheet data-detent={detent}>
        <div id="stops-content" data-mobile-sheet-content hidden={detent === 'collapsed'}>
          Stops content
        </div>
        <div className="mobile-sheet-handle-row">
          <MobileSheetHandle
            detent={detent}
            label="Stops panel"
            controlsId="stops-content"
            onDetentChange={onDetentChange}
          />
        </div>
      </section>
      <nav className="mobile-tab-bar" aria-label="Main navigation" />
    </>,
  )

  const panel = screen.getByRole('region', { name: 'Stops panel' })
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
    const measuredState = panel.getAttribute('data-mobile-sheet-measuring')
    if (measuredState === 'collapsed') return createRect(0)
    if (measuredState === 'partial') return createRect(200)
    if (measuredState === 'full') return createRect(600)

    const inlineHeight = Number.parseFloat((panel as HTMLElement).style.height)
    if (inlineHeight >= 0 && (panel as HTMLElement).style.height) return createRect(inlineHeight)
    return createRect(detent === 'full' ? 600 : detent === 'partial' ? 200 : 0)
  })
  const tabBar = screen.getByRole('navigation', { name: 'Main navigation' })
  vi.spyOn(tabBar, 'getBoundingClientRect').mockReturnValue(createRect(64))

  return { panel, button: screen.getByRole('button'), onDetentChange }
}

describe('MobileSheetHandle', () => {
  it('moves through collapsed, partial, and full with accessible button and keyboard activation', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('collapsed')
      return (
        <section aria-label="Stops panel" data-mobile-sheet data-detent={detent}>
          <div id="stops-content" data-mobile-sheet-content hidden={detent === 'collapsed'}>
            Stops content
          </div>
          <div className="mobile-sheet-handle-row">
            <MobileSheetHandle
              detent={detent}
              label="Stops panel"
              controlsId="stops-content"
              onDetentChange={setDetent}
            />
          </div>
        </section>
      )
    }

    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Expand Stops panel' })
    expect(handle.getAttribute('aria-controls')).toBe('stops-content')
    expect(handle.getAttribute('aria-expanded')).toBe('false')

    await user.click(handle)
    const partialHandle = screen.getByRole('button', { name: 'Expand Stops panel' })
    expect(partialHandle.getAttribute('aria-expanded')).toBe('true')
    expect(partialHandle.getAttribute('aria-description')).toBe('Opens the full-screen sheet.')

    await user.keyboard('{Enter}')
    const fullHandle = screen.getByRole('button', { name: 'Collapse Stops panel' })
    expect(fullHandle.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard(' ')

    expect(screen.getByRole('button', { name: 'Expand Stops panel' }).getAttribute('aria-expanded'))
      .toBe('false')
  })

  it('taps from partial to full and full to collapsed', async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()
    function Harness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('partial')
      return (
        <section aria-label="Stops panel" data-mobile-sheet data-detent={detent}>
          <div id="stops-content" data-mobile-sheet-content hidden={detent === 'collapsed'}>
            Stops content
          </div>
          <div className="mobile-sheet-handle-row">
            <MobileSheetHandle
              detent={detent}
              label="Stops panel"
              controlsId="stops-content"
              onDetentChange={(nextDetent) => {
                onDetentChange(nextDetent)
                setDetent(nextDetent)
              }}
            />
          </div>
        </section>
      )
    }

    render(<Harness />)
    const button = screen.getByRole('button', { name: 'Expand Stops panel' })
    await user.click(button)
    await user.click(button)

    expect(onDetentChange.mock.calls).toEqual([['full'], ['collapsed']])
  })

  it('snaps an upward drag from partial to full and suppresses the following click', () => {
    const { button, onDetentChange } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 0 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 0 })
    button.click()

    expect(onDetentChange).toHaveBeenCalledTimes(1)
    expect(onDetentChange).toHaveBeenCalledWith('full')
  })

  it('snaps a downward drag from partial to collapsed', () => {
    const { button, onDetentChange } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 100 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 400 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 400 })

    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
  })

  it('allows resisted travel above full and caps upper overdrag at 32 pixels', () => {
    const { button, panel } = renderHandle('full')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: -400 })

    const dragHeight = Number.parseFloat((panel as HTMLElement).style.height)
    expect(dragHeight).toBeGreaterThan(600)
    expect(dragHeight).toBeLessThanOrEqual(632)
    expect(dragHeight).toBeCloseTo(632, 3)
    expect((panel as HTMLElement).style.maxHeight)
      .toBe('calc(var(--mobile-viewport-height) + 32px)')
  })

  it('springs upper overdrag back to full with the bounce easing', () => {
    const { button, onDetentChange, panel } = renderHandle('full')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 236 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 236 })

    expect((panel as HTMLElement).style.height).toBe('600px')
    expect((panel as HTMLElement).style.transition)
      .toBe('height 220ms cubic-bezier(0.2, 1.15, 0.3, 1), bottom 220ms cubic-bezier(0.2, 1.15, 0.3, 1)')
    expect(panel.getAttribute('data-mobile-sheet-settling')).toBe('full')
    expect(onDetentChange).toHaveBeenCalledWith('full')
  })

  it('springs lower overdrag back to collapsed without a negative sheet height', () => {
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 700 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 700 })

    expect((panel as HTMLElement).style.height).toBe('0px')
    expect((panel as HTMLElement).style.transition)
      .toBe('height 220ms cubic-bezier(0.2, 1.15, 0.3, 1), bottom 220ms cubic-bezier(0.2, 1.15, 0.3, 1)')
    expect(panel.getAttribute('data-mobile-sheet-settling')).toBe('collapsed')
    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
  })

  it('uses a normal snap when an overdrag returns within range before release', () => {
    const { button, panel } = renderHandle('full')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 236 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 310 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 310 })

    expect((panel as HTMLElement).style.height).toBe('600px')
    expect((panel as HTMLElement).style.transition).toBe('height 180ms ease-out, bottom 180ms ease-out')
  })

  it('skips the rebound when reduced motion is requested', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 700 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 700 })

    expect((panel as HTMLElement).style.height).toBe('0px')
    expect((panel as HTMLElement).style.transition).toBe('height 0ms ease-out, bottom 0ms ease-out')
    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('restores the starting sheet state when the drag is cancelled', () => {
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 500 })
    firePointer(button, 'pointercancel', { pointerId: 1, clientY: 500 })

    expect(onDetentChange).not.toHaveBeenCalled()
    expect(panel.hasAttribute('data-mobile-sheet-dragging')).toBe(false)
    expect((panel as HTMLElement).style.height).toBe('')
    expect((panel as HTMLElement).style.maxHeight).toBe('')
  })

  it('does not start dragging from the sheet content', () => {
    const { onDetentChange, panel } = renderHandle('full')
    const content = screen.getByText('Stops content')

    firePointer(content, 'pointerdown', { pointerId: 2, clientY: 300 })
    firePointer(content, 'pointermove', { pointerId: 2, clientY: 180 })
    firePointer(content, 'pointerup', { pointerId: 2, clientY: 180 })

    expect(onDetentChange).not.toHaveBeenCalled()
    expect(panel.hasAttribute('data-mobile-sheet-dragging')).toBe(false)
    expect((panel as HTMLElement).style.height).toBe('')
  })
})

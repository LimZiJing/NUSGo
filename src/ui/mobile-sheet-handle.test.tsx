// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileSheetHandle } from './mobile-sheet-handle'

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

function renderHandle(expanded: boolean, onExpandedChange = vi.fn()) {
  render(
    <section
      aria-label="Stops panel"
      data-mobile-sheet
      data-expanded={expanded}
    >
      <div data-mobile-sheet-content hidden={!expanded}>Stops content</div>
      <div className="mobile-sheet-handle-row">
        <MobileSheetHandle
          expanded={expanded}
          label="Stops"
          controlsId="stops-content"
          onExpandedChange={onExpandedChange}
        />
      </div>
    </section>,
  )

  const panel = screen.getByRole('region', { name: 'Stops panel' })
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
    const measuredState = panel.getAttribute('data-mobile-sheet-measuring')
    if (measuredState === 'compact') return createRect(100)
    if (measuredState === 'expanded') return createRect(300)

    const inlineHeight = Number.parseFloat((panel as HTMLElement).style.height)
    if (inlineHeight > 0) return createRect(inlineHeight)
    return createRect(panel.getAttribute('data-expanded') === 'true' ? 300 : 100)
  })

  return { panel, button: screen.getByRole('button'), onExpandedChange }
}

describe('MobileSheetHandle', () => {
  it('toggles the sheet with an accessible button and keyboard activation', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [expanded, setExpanded] = useState(false)
      return (
        <section aria-label="Stops panel" data-mobile-sheet data-expanded={expanded}>
          <div id="stops-content" data-mobile-sheet-content hidden={!expanded}>
            Stops content
          </div>
          <div className="mobile-sheet-handle-row">
            <MobileSheetHandle
              expanded={expanded}
              label="Stops panel"
              controlsId="stops-content"
              onExpandedChange={setExpanded}
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
    expect(screen.getByRole('button', { name: 'Collapse Stops panel' })
      .getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Expand Stops panel' })
      .getAttribute('aria-expanded')).toBe('false')

    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Collapse Stops panel' })
      .getAttribute('aria-expanded')).toBe('true')
  })

  it('expands on an upward drag without toggling a second time on click', () => {
    const { button, onExpandedChange } = renderHandle(false)

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 180 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 180 })
    fireEvent.click(button)

    expect(onExpandedChange).toHaveBeenCalledTimes(1)
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })

  it('collapses on a downward drag', () => {
    const { button, onExpandedChange } = renderHandle(true)

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 100 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 220 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 220 })

    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })

  it('allows resisted travel above the expanded height', () => {
    const { button, panel } = renderHandle(true)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 236 })

    const dragHeight = Number.parseFloat((panel as HTMLElement).style.height)
    expect(dragHeight).toBeGreaterThan(300)
    expect(dragHeight).toBeCloseTo(327.67, 1)
    expect((panel as HTMLElement).style.maxHeight)
      .toBe('calc(var(--mobile-sheet-max-height) + 32px)')
  })

  it('caps upper overdrag at 32 pixels', () => {
    const { button, panel } = renderHandle(true)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: -400 })

    const dragHeight = Number.parseFloat((panel as HTMLElement).style.height)
    expect(dragHeight).toBeGreaterThan(300)
    expect(dragHeight).toBeLessThanOrEqual(332)
    expect(dragHeight).toBeCloseTo(332, 3)
  })

  it('allows resisted travel below the compact height with a 32-pixel cap', () => {
    const { button, panel } = renderHandle(false)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 1400 })

    const dragHeight = Number.parseFloat((panel as HTMLElement).style.height)
    expect(dragHeight).toBeLessThan(100)
    expect(dragHeight).toBeGreaterThanOrEqual(68)
    expect(dragHeight).toBeCloseTo(68, 3)
    expect((panel as HTMLElement).style.maxHeight).toBe('var(--mobile-sheet-max-height)')
  })

  it('springs an upper overdrag back to the expanded stop on release', () => {
    const { button, onExpandedChange, panel } = renderHandle(true)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 236 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 236 })

    expect((panel as HTMLElement).style.height).toBe('300px')
    expect((panel as HTMLElement).style.transition)
      .toBe('height 220ms cubic-bezier(0.2, 1.15, 0.3, 1)')
    expect(panel.getAttribute('data-mobile-sheet-settling')).toBe('expanded')
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })

  it('springs a lower overdrag back to the compact stop on release', () => {
    const { button, onExpandedChange, panel } = renderHandle(false)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 400 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 400 })

    expect((panel as HTMLElement).style.height).toBe('100px')
    expect((panel as HTMLElement).style.transition)
      .toBe('height 220ms cubic-bezier(0.2, 1.15, 0.3, 1)')
    expect(panel.getAttribute('data-mobile-sheet-settling')).toBe('compact')
    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })

  it('uses the normal snap when an overdrag returns within range before release', () => {
    const { button, panel } = renderHandle(true)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 236 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 310 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 310 })

    expect((panel as HTMLElement).style.height).toBe('300px')
    expect((panel as HTMLElement).style.transition).toBe('height 180ms ease-out')
    expect((panel as HTMLElement).style.maxHeight).toBe('var(--mobile-sheet-max-height)')
  })

  it('skips the rebound when reduced motion is requested', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { button, onExpandedChange, panel } = renderHandle(false)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 400 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 400 })

    expect((panel as HTMLElement).style.height).toBe('100px')
    expect((panel as HTMLElement).style.transition).toBe('height 0ms ease-out')
    expect(onExpandedChange).toHaveBeenCalledWith(false)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('restores the starting sheet state when the drag is cancelled', () => {
    const { button, onExpandedChange, panel } = renderHandle(false)

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 500 })
    firePointer(button, 'pointercancel', { pointerId: 1, clientY: 500 })

    expect(onExpandedChange).not.toHaveBeenCalled()
    expect(panel.hasAttribute('data-mobile-sheet-dragging')).toBe(false)
    expect((panel as HTMLElement).style.height).toBe('')
    expect((panel as HTMLElement).style.maxHeight).toBe('')
  })

  it('does not start dragging from the sheet content', () => {
    const { onExpandedChange, panel } = renderHandle(true)
    const content = screen.getByText('Stops content')

    firePointer(content, 'pointerdown', { pointerId: 2, clientY: 300 })
    firePointer(content, 'pointermove', { pointerId: 2, clientY: 180 })
    firePointer(content, 'pointerup', { pointerId: 2, clientY: 180 })

    expect(onExpandedChange).not.toHaveBeenCalled()
    expect(panel.hasAttribute('data-mobile-sheet-dragging')).toBe(false)
    expect((panel as HTMLElement).style.height).toBe('')
  })
})

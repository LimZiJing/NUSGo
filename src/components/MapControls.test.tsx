// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapControls } from './MapControls'
import { isFocusInsideMapControls } from './map-controls-focus'

afterEach(cleanup)

describe('MapControls', () => {
  it('opens a labelled popover with zoom and reset actions', async () => {
    const user = userEvent.setup()
    render(<MapControls visible topOffset={84} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onReset={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'Map controls' })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    await user.click(chip)

    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Map controls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeTruthy()
  })

  it('closes after an action and restores chip focus on Escape', async () => {
    const user = userEvent.setup()
    const onZoomIn = vi.fn()
    render(<MapControls visible topOffset={84} onZoomIn={onZoomIn} onZoomOut={vi.fn()} onReset={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'Map controls' })
    await user.click(chip)
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(onZoomIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Zoom out' })).toBeNull()

    await user.click(chip)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
    expect(document.activeElement).toBe(chip)
  })

  it('supports controlled state and invokes zoom out and reset actions', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onZoomOut = vi.fn()
    const onReset = vi.fn()
    const { rerender } = render(
      <MapControls
        visible
        topOffset={84}
        open={false}
        onOpenChange={onOpenChange}
        onZoomIn={vi.fn()}
        onZoomOut={onZoomOut}
        onReset={onReset}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Map controls' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    rerender(
      <MapControls
        visible
        topOffset={84}
        open
        onOpenChange={onOpenChange}
        onZoomIn={vi.fn()}
        onZoomOut={onZoomOut}
        onReset={onReset}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(onZoomOut).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('dismisses on outside map interaction and hides with the expanded trip editor', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <>
        <MapControls visible topOffset={84} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onReset={vi.fn()} />
        <button type="button">Map canvas</button>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Map controls' }))
    await user.click(screen.getByRole('button', { name: 'Map canvas' }))
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()

    rerender(
      <>
        <MapControls visible={false} topOffset={84} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onReset={vi.fn()} />
        <button type="button">Map canvas</button>
      </>,
    )
    expect(screen.queryByRole('button', { name: 'Map controls' })).toBeNull()
  })

  it('identifies focused controls before a parent hides the toolbar and preserves fallback focus', async () => {
    function VisibilityHarness() {
      const [visible, setVisible] = useState(true)
      const rootRef = useRef<HTMLDivElement>(null)
      const fallbackRef = useRef<HTMLButtonElement>(null)
      const hideControls = (): void => {
        if (isFocusInsideMapControls(rootRef.current)) fallbackRef.current?.focus()
        setVisible(false)
      }

      return (
        <>
          <MapControls
            visible={visible}
            topOffset={84}
            open
            onRootChange={(root) => {
              rootRef.current = root
            }}
            onOpenChange={vi.fn()}
            onZoomIn={vi.fn()}
            onZoomOut={vi.fn()}
            onReset={vi.fn()}
          />
          <button
            ref={fallbackRef}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={hideControls}
          >
            Trip endpoint fallback
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(<VisibilityHarness />)
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    const fallback = screen.getByRole('button', { name: 'Trip endpoint fallback' })
    zoomOut.focus()
    await user.click(screen.getByRole('button', { name: 'Trip endpoint fallback' }))
    expect(screen.queryByRole('button', { name: 'Map controls' })).toBeNull()
    expect(document.activeElement).toBe(fallback)
  })
})

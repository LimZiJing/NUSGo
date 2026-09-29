// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { animateMobileSheet } from './animate-mobile-sheet'
import { MobileSheetHandle } from './mobile-sheet-handle'
import type { MobileSheetDetent } from './mobile-sheet-detent'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
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

function renderHandle(
  detent: MobileSheetDetent,
  onDetentChange = vi.fn(),
  restoreDetent: 'partial' | 'full' = 'partial',
  heights: { readonly collapsed: number; readonly partial: number; readonly full: number } = {
    collapsed: 44,
    partial: 200,
    full: 600,
  },
) {
  render(
    <>
      <section aria-label="Stops panel" data-mobile-sheet data-detent={detent}>
        <div id="stops-content" data-mobile-sheet-content hidden={detent === 'collapsed'}>
          Stops content
        </div>
        <div className="mobile-sheet-handle-row">
          <MobileSheetHandle
            detent={detent}
            restoreDetent={restoreDetent}
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
    if (measuredState === 'collapsed') return createRect(heights.collapsed)
    if (measuredState === 'partial') return createRect(heights.partial)
    if (measuredState === 'full') return createRect(heights.full)

    const inlineHeight = Number.parseFloat((panel as HTMLElement).style.height)
    if (inlineHeight >= 0 && (panel as HTMLElement).style.height) return createRect(inlineHeight)
    return createRect(detent === 'full' ? heights.full : detent === 'partial' ? heights.partial : heights.collapsed)
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
              restoreDetent="full"
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
    await user.click(button)

    expect(onDetentChange.mock.calls).toEqual([['full'], ['collapsed'], ['full']])
  })

  it('reopens a collapsed pull tab at the remembered non-collapsed detent', async () => {
    const { button, onDetentChange } = renderHandle('collapsed', vi.fn(), 'full')

    await userEvent.setup().click(button)

    expect(onDetentChange).toHaveBeenCalledWith('full')
  })

  it('can drag upward from the collapsed pull tab to the partial detent', () => {
    const { button, onDetentChange, panel } = renderHandle('collapsed')

    firePointer(button, 'pointerdown', { pointerId: 4, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 4, clientY: 40 })
    expect(panel.style.height).toBe('304px')
    firePointer(button, 'pointerup', { pointerId: 4, clientY: 40 })

    expect(onDetentChange).toHaveBeenCalledWith('partial')
    expect(panel.style.height).toBe('200px')
  })

  it('restores hidden content and sizing constraints when a collapsed drag is cancelled', () => {
    const { button, panel } = renderHandle('collapsed')
    const content = panel.querySelector<HTMLElement>('[data-mobile-sheet-content]')

    firePointer(button, 'pointerdown', { pointerId: 5, clientY: 300 })
    expect(content?.hasAttribute('hidden')).toBe(false)

    firePointer(button, 'pointermove', { pointerId: 5, clientY: 200 })
    firePointer(button, 'pointercancel', { pointerId: 5, clientY: 200 })

    expect(panel.dataset.detent).toBe('collapsed')
    expect(content?.hasAttribute('hidden')).toBe(true)
    expect(panel.style.height).toBe('')
    expect(panel.style.minHeight).toBe('')
    expect(panel.style.maxHeight).toBe('')
    expect(panel.hasAttribute('data-mobile-sheet-dragging')).toBe(false)
  })

  it('snaps an upward drag from partial to full and suppresses the following click', () => {
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, button: 0, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 0 })
    expect((panel as HTMLElement).style.getPropertyPriority('height')).toBe('important')
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 0 })
    expect((panel as HTMLElement).style.getPropertyPriority('height')).toBe('important')
    button.click()

    expect(onDetentChange).toHaveBeenCalledTimes(1)
    expect(onDetentChange).toHaveBeenCalledWith('full')
  })

  it('starts a drag from an active transition and restores the selected detent after settling', () => {
    vi.useFakeTimers()
    let panelForDetent: HTMLElement | null = null
    const onDetentChange = vi.fn((nextDetent: MobileSheetDetent) => {
      if (panelForDetent) panelForDetent.dataset.detent = nextDetent
    })
    let frameCallback: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const rendered = renderHandle('full', onDetentChange)
    const { button, panel } = rendered
    panelForDetent = panel
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ bottom: '64px' } as CSSStyleDeclaration)
    let transitioning = false
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
      const measuring = panel.getAttribute('data-mobile-sheet-measuring')
      if (measuring === 'collapsed') return createRect(44)
      if (measuring === 'partial') return createRect(200)
      if (measuring === 'full') return createRect(600)
      if (transitioning && panel.hasAttribute('data-mobile-sheet-animating')) return createRect(360)
      const inlineHeight = Number.parseFloat(panel.style.height)
      if (panel.style.height) return createRect(inlineHeight)
      return createRect(panel.dataset.detent === 'full' ? 600 : 200)
    })

    animateMobileSheet(panel, 200, false, 64)
    expect(frameCallback).toBeDefined()
    frameCallback?.(0)
    transitioning = true

    firePointer(button, 'pointerdown', { pointerId: 3, clientY: 300 })
    expect(Number.parseFloat(panel.style.height)).toBe(360)
    expect(panel.hasAttribute('data-mobile-sheet-animating')).toBe(false)

    firePointer(button, 'pointermove', { pointerId: 3, clientY: 360 })
    firePointer(button, 'pointerup', { pointerId: 3, clientY: 360 })
    expect(onDetentChange).toHaveBeenCalledWith('partial')
    expect(panel.style.height).toBe('200px')

    vi.advanceTimersByTime(300)

    expect(panel.dataset.detent).toBe('partial')
    expect(panel.style.height).toBe('')
    expect(panel.hasAttribute('data-mobile-sheet-settling')).toBe(false)
  })

  it('snaps a downward drag from partial to collapsed', () => {
    const { button, onDetentChange } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 100 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 400 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 400 })

    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
  })

  it('tracks the finger directly between detents without resistance', () => {
    const { button, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 200 })

    expect(Number.parseFloat(panel.style.height)).toBe(300)
    expect(panel.style.maxHeight).toBe('var(--mobile-viewport-height)')
  })

  it('clamps at full and settles with the bounce easing', () => {
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

  it('clamps at the visible collapsed tab and settles there', () => {
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 700 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 700 })

    expect((panel as HTMLElement).style.height).toBe('44px')
    expect((panel as HTMLElement).style.transition)
      .toBe('height 220ms cubic-bezier(0.2, 1.15, 0.3, 1), bottom 220ms cubic-bezier(0.2, 1.15, 0.3, 1)')
    expect(panel.getAttribute('data-mobile-sheet-settling')).toBe('collapsed')
    expect(onDetentChange).toHaveBeenCalledWith('collapsed')
  })

  it.each([
    { visibleHeight: 299, detent: 'collapsed' },
    { visibleHeight: 300, detent: 'partial' },
    { visibleHeight: 600, detent: 'partial' },
    { visibleHeight: 601, detent: 'full' },
  ] as const)('uses viewport thresholds at $visibleHeight px', ({ visibleHeight, detent }) => {
    vi.stubGlobal('innerHeight', 1000)
    const heights = { collapsed: 44, partial: 400, full: 900 }
    const { button, onDetentChange, panel } = renderHandle('partial', vi.fn(), 'partial', heights)
    const releaseY = 700 - visibleHeight

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: releaseY })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: releaseY })

    expect(onDetentChange).toHaveBeenCalledWith(detent)
    expect(panel.style.height).toBe(`${heights[detent]}px`)
  })

  it('uses the visual viewport height when it differs from the layout viewport', () => {
    vi.stubGlobal('innerHeight', 1000)
    vi.stubGlobal('visualViewport', { height: 500 })
    const heights = { collapsed: 44, partial: 400, full: 900 }
    const { button, onDetentChange, panel } = renderHandle('partial', vi.fn(), 'partial', heights)

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 450 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 450 })

    expect(onDetentChange).toHaveBeenCalledWith('partial')
    expect(panel.style.height).toBe('400px')
  })

  it('preserves the partial detent when release has no meaningful movement', () => {
    vi.stubGlobal('innerHeight', 1000)
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 300 })

    expect(onDetentChange).not.toHaveBeenCalled()
    expect(panel.style.height).toBe('')
  })

  it('skips the rebound when reduced motion is requested', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { button, onDetentChange, panel } = renderHandle('partial')

    firePointer(button, 'pointerdown', { pointerId: 1, clientY: 300 })
    firePointer(button, 'pointermove', { pointerId: 1, clientY: 700 })
    firePointer(button, 'pointerup', { pointerId: 1, clientY: 700 })

    expect((panel as HTMLElement).style.height).toBe('44px')
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

// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NavigationView } from '../navigation/navigation-state'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import { useStopsEntryRefit } from './use-stops-entry-refit'

interface Props {
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly stopsDetent: MobileSheetDetent
  readonly rememberedStopId: string | null
}

function setup(initial: Partial<Props> = {}) {
  const focusStopInStopsTab = vi.fn()
  const initialProps: Props = {
    isMobileViewport: false,
    activeView: 'stops',
    stopsDetent: 'partial',
    rememberedStopId: 'stop-1',
    ...initial,
  }
  const view = renderHook(
    (props: Props) => useStopsEntryRefit({ commands: { focusStopInStopsTab }, ...props }),
    { initialProps },
  )
  return { focusStopInStopsTab, initialProps, ...view }
}

describe('useStopsEntryRefit', () => {
  it('refocuses the remembered stop when entering Stops on desktop', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup({ activeView: 'explore' })

    expect(focusStopInStopsTab).not.toHaveBeenCalled()
    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).toHaveBeenCalledOnce()
    expect(focusStopInStopsTab).toHaveBeenCalledWith('stop-1')
  })

  it('refocuses the remembered stop when entering Stops on mobile with an expanded sheet', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup({
      isMobileViewport: true,
      activeView: 'explore',
      stopsDetent: 'partial',
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).toHaveBeenCalledWith('stop-1')
  })

  it('does nothing without a remembered stop', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup({
      activeView: 'explore',
      rememberedStopId: null,
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).not.toHaveBeenCalled()
  })

  it('refocuses when the remembered stop changes while Stops is active', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup()

    expect(focusStopInStopsTab).toHaveBeenCalledOnce()
    rerender({ ...initialProps, rememberedStopId: 'stop-2' })
    expect(focusStopInStopsTab).toHaveBeenCalledTimes(2)
    expect(focusStopInStopsTab).toHaveBeenLastCalledWith('stop-2')
  })

  it('refits again when Stops is re-entered after Explore', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup()

    rerender({ ...initialProps, activeView: 'explore' })
    expect(focusStopInStopsTab).toHaveBeenCalledOnce()
    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).toHaveBeenCalledTimes(2)
    expect(focusStopInStopsTab).toHaveBeenLastCalledWith('stop-1')
  })

  it('does not refit when other props re-render', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup()

    rerender({ ...initialProps })
    rerender({ ...initialProps, stopsDetent: 'partial' })
    expect(focusStopInStopsTab).toHaveBeenCalledOnce()
  })

  it('does not refit on mobile while the Stops sheet is collapsed', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup({
      isMobileViewport: true,
      activeView: 'explore',
      stopsDetent: 'collapsed',
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).not.toHaveBeenCalled()
  })

  it('does not call the camera while Explore or Plan is active', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup({ activeView: 'explore' })

    rerender({ ...initialProps, rememberedStopId: 'stop-2' })
    rerender({ ...initialProps, activeView: 'plan', rememberedStopId: 'stop-3' })
    expect(focusStopInStopsTab).not.toHaveBeenCalled()
  })
})

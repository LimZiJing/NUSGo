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
  const focusCurrentLocationIfKnown = vi.fn()
  const clearStopsPin = vi.fn()
  const initialProps: Props = {
    isMobileViewport: false,
    activeView: 'stops',
    stopsDetent: 'partial',
    rememberedStopId: 'stop-1',
    ...initial,
  }
  const view = renderHook(
    (props: Props) => useStopsEntryRefit({
        commands: { focusStopInStopsTab, clearStopsPin, focusCurrentLocationIfKnown },
        ...props,
      }),
    { initialProps },
  )
  return { focusStopInStopsTab, clearStopsPin, focusCurrentLocationIfKnown, initialProps, ...view }
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

  it('recentres on the device location without a remembered stop', () => {
    const { focusStopInStopsTab, focusCurrentLocationIfKnown, initialProps, rerender } = setup({
      activeView: 'explore',
      rememberedStopId: null,
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusStopInStopsTab).not.toHaveBeenCalled()
    expect(focusCurrentLocationIfKnown).toHaveBeenCalledOnce()
  })

  it('recentres on the device location when entering Stops from Plan without a remembered stop', () => {
    const { focusCurrentLocationIfKnown, initialProps, rerender } = setup({
      activeView: 'plan',
      rememberedStopId: null,
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusCurrentLocationIfKnown).toHaveBeenCalledOnce()
  })

  it('does not recentre on the device location when a stop is remembered', () => {
    const { focusCurrentLocationIfKnown, initialProps, rerender } = setup({ activeView: 'explore' })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusCurrentLocationIfKnown).not.toHaveBeenCalled()
  })

  it('does not recentre when the remembered stop is cleared while Stops is active', () => {
    const { focusCurrentLocationIfKnown, initialProps, rerender } = setup()

    rerender({ ...initialProps, rememberedStopId: null })
    expect(focusCurrentLocationIfKnown).not.toHaveBeenCalled()
  })

  it('does not recentre on mobile while the Stops sheet is collapsed', () => {
    const { focusCurrentLocationIfKnown, initialProps, rerender } = setup({
      isMobileViewport: true,
      activeView: 'explore',
      stopsDetent: 'collapsed',
      rememberedStopId: null,
    })

    rerender({ ...initialProps, activeView: 'stops' })
    expect(focusCurrentLocationIfKnown).not.toHaveBeenCalled()
  })

  it('refocuses when the remembered stop changes while Stops is active', () => {
    const { focusStopInStopsTab, initialProps, rerender } = setup()

    expect(focusStopInStopsTab).toHaveBeenCalledOnce()
    rerender({ ...initialProps, rememberedStopId: 'stop-2' })
    expect(focusStopInStopsTab).toHaveBeenCalledTimes(2)
    expect(focusStopInStopsTab).toHaveBeenLastCalledWith('stop-2')
  })

  it('clears the pin when the remembered stop is cleared while Stops is active', () => {
    const { clearStopsPin, initialProps, rerender } = setup()

    expect(clearStopsPin).not.toHaveBeenCalled()
    rerender({ ...initialProps, rememberedStopId: null })
    expect(clearStopsPin).toHaveBeenCalledOnce()
  })

  it('clears the pin on a collapsed mobile sheet without moving the camera', () => {
    const { clearStopsPin, focusStopInStopsTab, initialProps, rerender } = setup({
      isMobileViewport: true,
      stopsDetent: 'collapsed',
    })

    rerender({ ...initialProps, rememberedStopId: null })
    expect(clearStopsPin).toHaveBeenCalledOnce()
    expect(focusStopInStopsTab).not.toHaveBeenCalled()
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

// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NavigationView } from '../navigation/navigation-state'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import { useMobilePlanRefit } from './use-mobile-plan-refit'

interface Props {
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly planDetent: MobileSheetDetent
  readonly hasJourney: boolean
}

function setup(initial: Partial<Props> = {}) {
  const fitJourneyRoutes = vi.fn()
  const initialProps: Props = {
    isMobileViewport: true,
    activeView: 'plan',
    planDetent: 'partial',
    hasJourney: true,
    ...initial,
  }
  const view = renderHook(
    (props: Props) => useMobilePlanRefit({ commands: { fitJourneyRoutes }, ...props }),
    { initialProps },
  )
  return { fitJourneyRoutes, initialProps, ...view }
}

describe('useMobilePlanRefit', () => {
  it('refits the Journey when the Plan sheet detent changes', () => {
    const { fitJourneyRoutes, initialProps, rerender } = setup()

    expect(fitJourneyRoutes).toHaveBeenCalledOnce()
    rerender({ ...initialProps, planDetent: 'collapsed' })
    expect(fitJourneyRoutes).toHaveBeenCalledTimes(2)
    rerender({ ...initialProps, planDetent: 'partial' })
    expect(fitJourneyRoutes).toHaveBeenCalledTimes(3)
  })

  it('refits when Plan becomes active again', () => {
    const { fitJourneyRoutes, initialProps, rerender } = setup({ activeView: 'explore' })

    expect(fitJourneyRoutes).not.toHaveBeenCalled()
    rerender({ ...initialProps, activeView: 'plan' })
    expect(fitJourneyRoutes).toHaveBeenCalledOnce()
    rerender({ ...initialProps, activeView: 'stops' })
    expect(fitJourneyRoutes).toHaveBeenCalledOnce()
  })

  it('does not refit without a Journey, on desktop, or behind a full sheet', () => {
    const noJourney = setup({ hasJourney: false })
    noJourney.rerender({ ...noJourney.initialProps, planDetent: 'collapsed' })
    expect(noJourney.fitJourneyRoutes).not.toHaveBeenCalled()

    const desktop = setup({ isMobileViewport: false })
    desktop.rerender({ ...desktop.initialProps, planDetent: 'collapsed' })
    expect(desktop.fitJourneyRoutes).not.toHaveBeenCalled()

    const full = setup({ planDetent: 'collapsed' })
    full.fitJourneyRoutes.mockClear()
    full.rerender({ ...full.initialProps, planDetent: 'full' })
    expect(full.fitJourneyRoutes).not.toHaveBeenCalled()
  })

  it('does not refit when only the Journey appears, so planning keeps its own fit', () => {
    const { fitJourneyRoutes, initialProps, rerender } = setup({ hasJourney: false })

    rerender({ ...initialProps, hasJourney: true })

    expect(fitJourneyRoutes).not.toHaveBeenCalled()
  })

  it('ignores other menus changing their detent', () => {
    const { fitJourneyRoutes, initialProps, rerender } = setup({ activeView: 'stops', planDetent: 'partial' })

    rerender({ ...initialProps, planDetent: 'collapsed' })

    expect(fitJourneyRoutes).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExploreMode } from '../../features/explore/state/explore-state'
import type { NavigationView } from '../navigation/navigation-state'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import { useExploreEntryRefit } from './use-explore-entry-refit'

interface Props {
  readonly isMobileViewport: boolean
  readonly activeView: NavigationView
  readonly exploreDetent: MobileSheetDetent
  readonly exploreMode: ExploreMode
  readonly selectedVenueCode: string | null
  readonly selectedBuildingId: string | null
  readonly selectedRouteId: string | null
}

const neutral: Props = {
  isMobileViewport: false,
  activeView: 'explore',
  exploreDetent: 'partial',
  exploreMode: 'neutral',
  selectedVenueCode: null,
  selectedBuildingId: null,
  selectedRouteId: null,
}

// Target-only fixtures, so spreading them never overrides the view or detent set alongside.
const venueTarget: Partial<Props> = {
  exploreMode: 'venue-detail',
  selectedVenueCode: 'LT19-B1',
}

const busRouteTarget: Partial<Props> = {
  exploreMode: 'bus-routes',
  selectedRouteId: 'A1',
}

function setup(initial: Partial<Props> = {}) {
  const refitExploreTarget = vi.fn()
  const initialProps: Props = { ...neutral, ...initial }
  const view = renderHook(
    (props: Props) => useExploreEntryRefit({ commands: { refitExploreTarget }, ...props }),
    { initialProps },
  )
  return { refitExploreTarget, initialProps, ...view }
}

describe('useExploreEntryRefit', () => {
  it('refits the selected venue when entering Explore', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({
      activeView: 'stops',
      ...venueTarget,
    })

    expect(refitExploreTarget).not.toHaveBeenCalled()
    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).toHaveBeenCalledOnce()
  })

  it('refits the selected building when entering Explore', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({
      activeView: 'stops',
      exploreMode: 'venue-detail',
      selectedBuildingId: 'BLK-7',
    })

    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).toHaveBeenCalledOnce()
  })

  it('refits the selected route when entering Explore on Bus routes', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({
      activeView: 'stops',
      ...busRouteTarget,
    })

    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).toHaveBeenCalledOnce()
  })

  it('leaves the camera alone when entering Explore without a target', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({ activeView: 'stops' })

    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).not.toHaveBeenCalled()
  })

  it('refits when the active target changes while Explore is open', () => {
    const { refitExploreTarget, initialProps, rerender } = setup(venueTarget)

    expect(refitExploreTarget).toHaveBeenCalledOnce()
    rerender({ ...initialProps, selectedVenueCode: 'LT19-B2' })
    expect(refitExploreTarget).toHaveBeenCalledTimes(2)

    rerender({ ...initialProps, exploreMode: 'bus-routes', selectedVenueCode: null, selectedRouteId: 'A2' })
    expect(refitExploreTarget).toHaveBeenCalledTimes(3)
  })

  it('does not refit on unrelated re-renders', () => {
    const { refitExploreTarget, initialProps, rerender } = setup(venueTarget)

    expect(refitExploreTarget).toHaveBeenCalledOnce()
    rerender({ ...initialProps })
    rerender({ ...initialProps, isMobileViewport: false, exploreDetent: 'full' })
    expect(refitExploreTarget).toHaveBeenCalledOnce()
  })

  it('does not refit while Stops or Plan is active', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({ ...venueTarget, activeView: 'stops' })

    rerender({ ...initialProps, selectedVenueCode: 'LT19-B2' })
    rerender({ ...initialProps, activeView: 'plan', selectedVenueCode: 'LT19-B3' })
    expect(refitExploreTarget).not.toHaveBeenCalled()
  })

  it('skips a collapsed mobile Explore sheet, then leaves the pending fit to the next inset report', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({
      isMobileViewport: true,
      activeView: 'stops',
      exploreDetent: 'collapsed',
      ...venueTarget,
    })

    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).not.toHaveBeenCalled()

    rerender({ ...initialProps, activeView: 'explore', exploreDetent: 'partial' })
    expect(refitExploreTarget).not.toHaveBeenCalled()
  })

  it('refits a mobile Explore sheet that is open when entering Explore', () => {
    const { refitExploreTarget, initialProps, rerender } = setup({
      isMobileViewport: true,
      activeView: 'stops',
      exploreDetent: 'partial',
      ...venueTarget,
    })

    rerender({ ...initialProps, activeView: 'explore' })
    expect(refitExploreTarget).toHaveBeenCalledOnce()
  })
})

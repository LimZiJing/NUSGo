// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { useMemo, useRef, type RefCallback, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NavigationState } from '../navigation/navigation-state'
import { createInitialNavigationState } from '../navigation/navigation-state'
import { useMapOverlayLayout } from './use-map-overlay-layout'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const navigation: NavigationState = createInitialNavigationState()

function setBounds(
  ref: RefObject<HTMLDivElement | null>,
  bounds: DOMRect,
): RefCallback<HTMLDivElement> {
  return (element) => {
    if (element) {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => bounds,
      })
    }
    ref.current = element
  }
}

function Probe({
  isMobileViewport,
  navigationState = navigation,
  sheetClassName,
  setViewportInsets,
  onMeasurementsApplied,
}: {
  readonly isMobileViewport: boolean
  readonly navigationState?: NavigationState
  readonly sheetClassName?: string
  readonly setViewportInsets: (insets: { top: number; right: number; bottom: number; left: number }) => void
  readonly onMeasurementsApplied: () => void
}) {
  const mapShellRef = useRef<HTMLDivElement>(null)
  const tripControlsRef = useRef<HTMLDivElement>(null)
  const explorePanelRef = useRef<HTMLDivElement>(null)
  const stopsSheetRef = useRef<HTMLDivElement>(null)
  const mainNavigationRef = useRef<HTMLDivElement>(null)
  const navigationColumnRef = useRef<HTMLDivElement>(null)
  const commands = useMemo(() => ({ setViewportInsets }), [setViewportInsets])
  const layout = useMapOverlayLayout({
    commands,
    isMobileViewport,
    navigation: navigationState,
    mapShellRef,
    tripControlsRef,
    explorePanelRef,
    stopsSheetRef,
    mainNavigationRef,
    navigationColumnRef,
    onMeasurementsApplied,
  })

  return (
    <>
      <div
        className="map-shell"
        ref={setBounds(mapShellRef, { top: 0, right: 390, bottom: 844, left: 0, width: 390, height: 844 } as DOMRect)}
      />
      <div ref={setBounds(tripControlsRef, { top: 20, right: 390, bottom: 112, left: 0, width: 390, height: 92 } as DOMRect)} />
      <div className={sheetClassName} ref={setBounds(explorePanelRef, { top: 200, right: 390, bottom: 500, left: 0, width: 390, height: 300 } as DOMRect)} />
      <div ref={setBounds(stopsSheetRef, { top: 200, right: 390, bottom: 500, left: 0, width: 390, height: 300 } as DOMRect)} />
      <div ref={setBounds(mainNavigationRef, { top: 780, right: 390, bottom: 844, left: 0, width: 390, height: 64 } as DOMRect)} />
      <div ref={setBounds(navigationColumnRef, { top: 0, right: 390, bottom: 844, left: 30, width: 360, height: 844 } as DOMRect)} />
      <output data-testid="navigation-width">{layout.navigationColumnWidth}</output>
    </>
  )
}

describe('useMapOverlayLayout', () => {
  it('applies mobile measurements and cleans up browser effects and shell styles', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    class MockResizeObserver {
      readonly callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const setViewportInsets = vi.fn()
    const onMeasurementsApplied = vi.fn()

    const view = render(
      <Probe
        isMobileViewport
        setViewportInsets={setViewportInsets}
        onMeasurementsApplied={onMeasurementsApplied}
      />,
    )

    const shell = view.container.querySelector('.map-shell') as HTMLElement
    expect(shell.style.getPropertyValue('--mobile-viewport-height')).toBe(`${window.innerHeight}px`)
    expect(shell.style.getPropertyValue('--mobile-tab-bar-height')).toBe('64px')
    expect(shell.style.getPropertyValue('--mobile-sheet-max-height')).toBe('')
    expect(setViewportInsets).toHaveBeenCalled()
    expect(onMeasurementsApplied).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledTimes(7)
    expect(screen.getByTestId('navigation-width').textContent).toBe('0')

    const resizeHandlers = addEventListener.mock.calls
      .filter(([event]) => event === 'resize')
      .map(([, listener]) => listener)
    expect(resizeHandlers).toHaveLength(2)

    act(() => view.unmount())

    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(shell.style.getPropertyValue('--mobile-viewport-height')).toBe('')
    expect(shell.style.getPropertyValue('--mobile-tab-bar-height')).toBe('')
    expect(removeEventListener.mock.calls.filter(([event]) => event === 'resize')).toEqual(
      expect.arrayContaining(resizeHandlers.map((handler) => ['resize', handler])),
    )
  })

  it('sizes the bottom inset from the detent so it is correct before the sheet finishes moving', () => {
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => name === '--mobile-sheet-collapsed-height' ? '44px' : '',
    }))
    vi.stubGlobal('innerHeight', 844)
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
    const setViewportInsets = vi.fn()
    const withDetent = (detent: 'collapsed' | 'partial' | 'full'): NavigationState => ({
      ...navigation,
      activeView: 'explore',
      sheets: { ...navigation.sheets, explore: { ...navigation.sheets.explore, detent } },
    })
    const renderWith = (detent: 'collapsed' | 'partial' | 'full') => (
      <Probe
        isMobileViewport
        navigationState={withDetent(detent)}
        sheetClassName="mobile-sheet-popup"
        setViewportInsets={setViewportInsets}
        onMeasurementsApplied={vi.fn()}
      />
    )

    // The mocked sheet reports the same bounds for every detent, like a sheet mid-transition.
    const view = render(renderWith('collapsed'))
    expect(setViewportInsets).toHaveBeenLastCalledWith(expect.objectContaining({ bottom: 120 }))
    view.rerender(renderWith('partial'))
    expect(setViewportInsets).toHaveBeenLastCalledWith(expect.objectContaining({ bottom: 498 }))
    view.rerender(renderWith('full'))
    expect(setViewportInsets).toHaveBeenLastCalledWith(expect.objectContaining({ bottom: 856 }))
  })
})

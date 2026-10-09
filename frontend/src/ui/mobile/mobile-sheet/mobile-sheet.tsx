import { Drawer } from '@base-ui/react/drawer'
import { useCallback, useLayoutEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { MobileSheetHandle } from './mobile-sheet-handle'
import { getMobileTabBarInset } from './mobile-sheet-layout'
import type { MobileSheetDetent, OpenMobileSheetDetent } from './mobile-sheet-detent'
import {
  createMobileSheetSnapPoints,
  getMobileSheetDetent,
  getMobileSheetSnapPoint,
  type MobileSheetSnapPoints,
} from './mobile-sheet-snap-points'

interface MobileSheetProps {
  readonly className: string
  readonly label: string
  readonly controlsId: string
  readonly active: boolean
  readonly portalContainer: HTMLElement | null
  readonly activeDetent: MobileSheetDetent
  readonly lastNonCollapsedDetent: OpenMobileSheetDetent
  readonly onDetentChange: (detent: MobileSheetDetent) => void
  readonly onButtonRef: (button: HTMLButtonElement | null) => void
  readonly onPanelRef: (panel: HTMLDivElement | null) => void
  readonly panelProps?: Omit<ComponentPropsWithoutRef<'section'>, 'className' | 'children' | 'ref'> & {
    readonly [key: `data-${string}`]: string | number | boolean | undefined
  }
  readonly children: ReactNode
}

const INITIAL_SNAP_POINTS: MobileSheetSnapPoints = ['44px', '200px', '640px']

export function MobileSheet({
  className,
  label,
  controlsId,
  active,
  portalContainer,
  activeDetent,
  lastNonCollapsedDetent,
  onDetentChange,
  onButtonRef,
  onPanelRef,
  panelProps,
  children,
}: MobileSheetProps) {
  const [snapPoints, setSnapPoints] = useState<MobileSheetSnapPoints>(INITIAL_SNAP_POINTS)
  const updateSnapPoints = useCallback((): void => {
    const mapShell = portalContainer
    if (!mapShell) return

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const tabBar = mapShell.querySelector<HTMLElement>('.main-navigation')
    const tabBarBounds = tabBar?.getBoundingClientRect()
    const shellBottom = mapShell.getBoundingClientRect().bottom
    const cssTabBarInset = Number.parseFloat(getComputedStyle(mapShell, '::after').height)
    const tabBarInset = getMobileTabBarInset(
      shellBottom,
      tabBarBounds ? { top: tabBarBounds.top, height: tabBarBounds.height } : null,
      Number.isFinite(cssTabBarInset) ? cssTabBarInset : 0,
    )
    const shellStyles = getComputedStyle(mapShell)
    const collapsedHeightValue = Number.parseFloat(
      shellStyles.getPropertyValue('--mobile-sheet-collapsed-height'),
    )
    const handleRowHeight = Number.parseFloat(
      shellStyles.getPropertyValue('--mobile-sheet-handle-row-height'),
    )
    const handleExtension = Number.parseFloat(
      shellStyles.getPropertyValue('--mobile-sheet-handle-target-extension'),
    )
    const collapsedHeight = Number.isFinite(collapsedHeightValue)
      ? collapsedHeightValue
      : (Number.isFinite(handleRowHeight) ? handleRowHeight : 0) +
        (Number.isFinite(handleExtension) ? handleExtension : 0)
    const nextSnapPoints = createMobileSheetSnapPoints(
      viewportHeight,
      tabBarInset,
      collapsedHeight,
    )

    setSnapPoints((current) => current.every((point, index) => point === nextSnapPoints[index])
      ? current
      : nextSnapPoints)
  }, [portalContainer])

  useLayoutEffect(() => {
    const mapShell = portalContainer
    if (!mapShell) return

    // Sync measured points before paint so the opening frame never uses fallback heights.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Required to prevent a first-frame detent jump.
    updateSnapPoints()
    window.addEventListener('resize', updateSnapPoints)
    window.visualViewport?.addEventListener('resize', updateSnapPoints)
    window.visualViewport?.addEventListener('scroll', updateSnapPoints)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateSnapPoints)
    const tabBar = mapShell.querySelector<HTMLElement>('.main-navigation')
    resizeObserver?.observe(mapShell)
    if (tabBar) resizeObserver?.observe(tabBar)

    return () => {
      window.removeEventListener('resize', updateSnapPoints)
      window.visualViewport?.removeEventListener('resize', updateSnapPoints)
      window.visualViewport?.removeEventListener('scroll', updateSnapPoints)
      resizeObserver?.disconnect()
    }
  }, [portalContainer, updateSnapPoints])

  return (
    <Drawer.Root
      // Keep each tab's drawer open so switching tabs changes its snap point
      // directly instead of replaying Base UI's opening transition from full.
      open
      modal={false}
      disablePointerDismissal
      snapPoints={[...snapPoints]}
      snapPoint={getMobileSheetSnapPoint(activeDetent, snapPoints)}
      snapToSequentialPoints
      onOpenChange={(open) => {
        if (active && !open) onDetentChange('collapsed')
      }}
      onSnapPointChange={(snapPoint) => {
        if (!active) return
        const nextDetent = getMobileSheetDetent(snapPoint, snapPoints)
        if (nextDetent !== activeDetent) onDetentChange(nextDetent)
      }}
    >
      {portalContainer && (
        <Drawer.Portal container={portalContainer} keepMounted>
          <Drawer.Viewport
            className="mobile-sheet-viewport"
            data-active={active ? 'true' : 'false'}
            data-detent={activeDetent}
            aria-hidden={!active}
            inert={!active}
          >
            <Drawer.Popup
              {...panelProps}
              className={`navigation-panel ${className} mobile-sheet-popup`}
              role="region"
              data-mobile-sheet=""
              data-detent={activeDetent}
              initialFocus={false}
              finalFocus={false}
              ref={onPanelRef}
            >
              <div className="mobile-sheet-handle-row">
                <MobileSheetHandle
                  detent={activeDetent}
                  restoreDetent={lastNonCollapsedDetent}
                  label={label}
                  controlsId={controlsId}
                  onButtonRef={onButtonRef}
                  onDetentChange={onDetentChange}
                />
              </div>
              <Drawer.Content className="mobile-sheet-content">
                {children}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      )}
    </Drawer.Root>
  )
}

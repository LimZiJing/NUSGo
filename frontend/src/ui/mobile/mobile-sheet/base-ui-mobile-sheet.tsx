import { Drawer } from '@base-ui/react/drawer'
import { useCallback, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { MobileSheetHandle } from './mobile-sheet-handle'
import { getMobileTabBarInset } from './mobile-sheet-layout'
import type { MobileSheetDetent, OpenMobileSheetDetent } from './mobile-sheet-detent'
import {
  createBaseUiMobileSheetSnapPoints,
  getBaseUiMobileSheetDetent,
  getBaseUiMobileSheetSnapPoint,
  type BaseUiMobileSheetSnapPoints,
} from './base-ui-mobile-sheet-state'

interface BaseUiMobileSheetProps {
  readonly className: string
  readonly label: string
  readonly controlsId: string
  readonly active: boolean
  readonly portalContainer: HTMLElement | null
  readonly detent: MobileSheetDetent
  readonly lastNonCollapsedDetent: OpenMobileSheetDetent
  readonly onBeforeToggle?: () => void
  readonly onDetentChange: (detent: MobileSheetDetent) => void
  readonly onButtonRef: (button: HTMLButtonElement | null) => void
  readonly onPanelRef: (panel: HTMLDivElement | null) => void
  readonly panelProps?: Omit<ComponentPropsWithoutRef<'section'>, 'className' | 'children' | 'ref'> & {
    readonly [key: `data-${string}`]: string | number | boolean | undefined
  }
  readonly children: ReactNode
}

const INITIAL_SNAP_POINTS: BaseUiMobileSheetSnapPoints = ['44px', '200px', '640px']

export function BaseUiMobileSheet({
  className,
  label,
  controlsId,
  active,
  portalContainer,
  detent,
  lastNonCollapsedDetent,
  onBeforeToggle,
  onDetentChange,
  onButtonRef,
  onPanelRef,
  panelProps,
  children,
}: BaseUiMobileSheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [snapPoints, setSnapPoints] = useState<BaseUiMobileSheetSnapPoints>(INITIAL_SNAP_POINTS)
  const updateSnapPoints = useCallback((): void => {
    const viewport = viewportRef.current
    const mapShell = viewport?.closest<HTMLElement>('.map-shell')
    if (!viewport || !mapShell) return

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
    const nextSnapPoints = createBaseUiMobileSheetSnapPoints(
      viewportHeight,
      tabBarInset,
      collapsedHeight,
    )

    setSnapPoints((current) => current.every((point, index) => point === nextSnapPoints[index])
      ? current
      : nextSnapPoints)
  }, [])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const mapShell = viewport?.closest<HTMLElement>('.map-shell')
    if (!viewport || !mapShell) return

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
      open={active}
      modal={false}
      disablePointerDismissal
      snapPoints={[...snapPoints]}
      snapPoint={getBaseUiMobileSheetSnapPoint(detent, snapPoints)}
      snapToSequentialPoints
      onOpenChange={(open) => {
        if (!open) onDetentChange('collapsed')
      }}
      onSnapPointChange={(snapPoint) => {
        const nextDetent = getBaseUiMobileSheetDetent(snapPoint, snapPoints)
        if (nextDetent !== detent) onDetentChange(nextDetent)
      }}
    >
      {portalContainer && (
        <Drawer.Portal container={portalContainer}>
          <Drawer.Viewport
            className="base-ui-mobile-sheet-viewport"
            data-detent={detent}
            ref={viewportRef}
          >
            <Drawer.Popup
              {...panelProps}
              className={`navigation-panel ${className} base-ui-mobile-sheet-popup`}
              role="region"
              data-mobile-sheet=""
              data-detent={detent}
              data-sheet-implementation="base-ui"
              initialFocus={false}
              finalFocus={false}
              ref={onPanelRef}
            >
              <div className="mobile-sheet-handle-row">
                <MobileSheetHandle
                  detent={detent}
                  restoreDetent={lastNonCollapsedDetent}
                  dragEnabled={false}
                  label={label}
                  controlsId={controlsId}
                  onButtonRef={onButtonRef}
                  onBeforeClick={onBeforeToggle}
                  onDetentChange={onDetentChange}
                />
              </div>
              <Drawer.Content className="base-ui-mobile-sheet-content">
                {children}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      )}
    </Drawer.Root>
  )
}

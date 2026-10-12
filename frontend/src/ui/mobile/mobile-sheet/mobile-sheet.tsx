import { Drawer } from '@base-ui/react/drawer'
import { useContext, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { MobileSheetHandle } from './mobile-sheet-handle'
import { MobileSheetMetricsContext } from './mobile-sheet-metrics'
import type { MobileSheetDetent } from './mobile-sheet-detent'
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
  readonly detent: MobileSheetDetent
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
  detent,
  onDetentChange,
  onButtonRef,
  onPanelRef,
  panelProps,
  children,
}: MobileSheetProps) {
  const metrics = useContext(MobileSheetMetricsContext)
  const snapPoints = useMemo<MobileSheetSnapPoints>(() => metrics
    ? createMobileSheetSnapPoints(metrics.viewportHeight, metrics.tabBarInset, metrics.collapsedHeight)
    : INITIAL_SNAP_POINTS, [metrics])

  return (
    <Drawer.Root
      // Keep each tab's drawer open at its own saved detent so showing it does
      // not replay Base UI's opening transition or animate from another tab.
      open
      modal={false}
      disablePointerDismissal
      snapPoints={[...snapPoints]}
      snapPoint={getMobileSheetSnapPoint(detent, snapPoints)}
      snapToSequentialPoints
      onOpenChange={(open, eventDetails) => {
        if (open) return
        // This sheet stays mounted at its collapsed snap point, even after a
        // swipe that Base UI would otherwise turn into a drawer dismissal.
        eventDetails.cancel()
        if (active) onDetentChange('collapsed')
      }}
      onSnapPointChange={(snapPoint, eventDetails) => {
        if (snapPoint === null) eventDetails.cancel()
        if (!active) return
        const nextDetent = getMobileSheetDetent(snapPoint, snapPoints)
        if (nextDetent !== null && nextDetent !== detent) onDetentChange(nextDetent)
      }}
    >
      {portalContainer && (
        <Drawer.Portal container={portalContainer} keepMounted>
          <Drawer.Viewport
            className="mobile-sheet-viewport"
            data-active={active ? 'true' : 'false'}
            data-detent={detent}
            aria-hidden={!active}
            inert={!active}
          >
            <Drawer.Popup
              {...panelProps}
              className={`navigation-panel ${className} mobile-sheet-popup`}
              role="region"
              data-mobile-sheet=""
              data-detent={detent}
              initialFocus={false}
              finalFocus={false}
              ref={onPanelRef}
            >
              <div className="mobile-sheet-handle-row">
                <MobileSheetHandle
                  detent={detent}
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

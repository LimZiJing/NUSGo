import { Drawer } from '@base-ui/react/drawer'
import { useCallback, useContext, useEffect, useMemo, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
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
  readonly summary?: string
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
  summary,
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
  const popupRef = useRef<HTMLDivElement | null>(null)
  const contentMotionFrames = useRef(new Set<number>())
  const scheduleContentMotionCheck = (callback: () => void): void => {
    const id = requestAnimationFrame(() => {
      contentMotionFrames.current.delete(id)
      callback()
    })
    contentMotionFrames.current.add(id)
  }
  const clearContentMotionIfSettled = (sheet: HTMLDivElement): void => {
    const moving = sheet.hasAttribute('data-swiping') || (sheet.getAnimations?.() ?? []).some((animation) => (
      'transitionProperty' in animation && animation.transitionProperty === 'transform' && animation.playState === 'running'
    ))
    if (!moving) sheet.removeAttribute('data-content-motion-suppressed')
  }
  const setPopupRef = useCallback((node: HTMLDivElement | null) => {
    popupRef.current = node
    onPanelRef(node)
  }, [onPanelRef])
  const metrics = useContext(MobileSheetMetricsContext)
  const snapPoints = useMemo<MobileSheetSnapPoints>(() => metrics
    ? createMobileSheetSnapPoints(metrics.viewportHeight, metrics.tabBarInset, metrics.collapsedHeight)
    : INITIAL_SNAP_POINTS,
  [metrics])

  const changeDetent = (nextDetent: MobileSheetDetent): void => {
    if (nextDetent === detent) return
    // Set this before React applies the new detent so disclosure transitions
    // cannot start in the same style update as the sheet movement.
    const sheet = popupRef.current
    sheet?.setAttribute('data-content-motion-suppressed', '')
    if (sheet) {
      // Reduced motion and geometry changes can produce no transform transition.
      // Check after style has been applied, and let transition events own the
      // marker whenever the sheet is actually moving.
      scheduleContentMotionCheck(() => scheduleContentMotionCheck(() => clearContentMotionIfSettled(sheet)))
    }
    onDetentChange(nextDetent)
  }

  useEffect(() => {
    const sheet = popupRef.current
    if (!sheet) return
    const pendingFrames = contentMotionFrames.current
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === sheet && event.propertyName === 'transform') {
        scheduleContentMotionCheck(() => clearContentMotionIfSettled(sheet))
      }
    }
    const onTransitionCancel = (event: TransitionEvent): void => {
      if (event.target !== sheet || event.propertyName !== 'transform') return
      const moving = (sheet.getAnimations?.() ?? []).some((animation) => (
        'transitionProperty' in animation && animation.transitionProperty === 'transform' && animation.playState === 'running'
      ))
      if (!moving) scheduleContentMotionCheck(() => clearContentMotionIfSettled(sheet))
    }
    sheet.addEventListener('transitionend', onTransitionEnd)
    sheet.addEventListener('transitioncancel', onTransitionCancel)
    return () => {
      for (const id of pendingFrames) cancelAnimationFrame(id)
      pendingFrames.clear()
      sheet.removeEventListener('transitionend', onTransitionEnd)
      sheet.removeEventListener('transitioncancel', onTransitionCancel)
      sheet.removeAttribute('data-content-motion-suppressed')
    }
  }, [portalContainer])

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
        if (active) changeDetent('collapsed')
      }}
      onSnapPointChange={(snapPoint, eventDetails) => {
        if (snapPoint === null) eventDetails.cancel()
        if (!active) return
        const nextDetent = getMobileSheetDetent(snapPoint, snapPoints)
        if (nextDetent !== null && nextDetent !== detent) changeDetent(nextDetent)
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
              ref={setPopupRef}
            >
              <div className="mobile-sheet-handle-row">
                <MobileSheetHandle
                  detent={detent}
                  label={label}
                  summary={summary}
                  controlsId={controlsId}
                  onButtonRef={onButtonRef}
                  onDetentChange={changeDetent}
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

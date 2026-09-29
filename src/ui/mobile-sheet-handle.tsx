import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import {
  isOpenMobileSheetDetent,
  type MobileSheetDetent,
} from './mobile-sheet-detent'

interface MobileSheetHandleProps {
  readonly detent?: MobileSheetDetent
  readonly expanded?: boolean
  readonly label: string
  readonly controlsId: string
  readonly onButtonRef?: (button: HTMLButtonElement | null) => void
  readonly onBeforeClick?: () => void
  readonly onDetentChange?: (detent: MobileSheetDetent) => void
  readonly onExpandedChange?: (expanded: boolean) => void
}

interface InlineSheetStyles {
  readonly height: string
  readonly heightPriority: string
  readonly maxHeight: string
  readonly maxHeightPriority: string
  readonly overflow: string
  readonly overflowPriority: string
  readonly transition: string
  readonly transitionPriority: string
  readonly bottom: string
  readonly bottomPriority: string
}

interface DragStop {
  readonly detent: MobileSheetDetent
  readonly height: number
  readonly bottom: number
}

interface DragSession {
  readonly button: HTMLButtonElement
  readonly sheet: HTMLElement
  readonly pointerId: number
  readonly startY: number
  readonly startHeight: number
  readonly stops: readonly DragStop[]
  readonly styles: InlineSheetStyles
  currentHeight: number
  currentBottom: number
  requestedHeight: number
  moved: boolean
}

const DRAG_THRESHOLD = 6
const SETTLE_DURATION = 180
const MAX_OVERDRAG = 32
const OVERDRAG_SETTLE_DURATION = 220
const OVERDRAG_SETTLE_EASING = 'cubic-bezier(0.2, 1.15, 0.3, 1)'

function readInlineSheetStyles(sheet: HTMLElement): InlineSheetStyles {
  return {
    height: sheet.style.getPropertyValue('height'),
    heightPriority: sheet.style.getPropertyPriority('height'),
    maxHeight: sheet.style.getPropertyValue('max-height'),
    maxHeightPriority: sheet.style.getPropertyPriority('max-height'),
    overflow: sheet.style.getPropertyValue('overflow'),
    overflowPriority: sheet.style.getPropertyPriority('overflow'),
    transition: sheet.style.getPropertyValue('transition'),
    transitionPriority: sheet.style.getPropertyPriority('transition'),
    bottom: sheet.style.getPropertyValue('bottom'),
    bottomPriority: sheet.style.getPropertyPriority('bottom'),
  }
}

function restoreInlineSheetStyles(sheet: HTMLElement, styles: InlineSheetStyles): void {
  const entries = [
    ['height', styles.height, styles.heightPriority],
    ['max-height', styles.maxHeight, styles.maxHeightPriority],
    ['overflow', styles.overflow, styles.overflowPriority],
    ['transition', styles.transition, styles.transitionPriority],
    ['bottom', styles.bottom, styles.bottomPriority],
  ] as const

  for (const [property, value, priority] of entries) {
    if (value) sheet.style.setProperty(property, value, priority)
    else sheet.style.removeProperty(property)
  }
}

function restoreSheet(sheet: HTMLElement, styles: InlineSheetStyles): void {
  sheet.removeAttribute('data-mobile-sheet-measuring')
  sheet.removeAttribute('data-mobile-sheet-dragging')
  sheet.removeAttribute('data-mobile-sheet-settling')
  restoreInlineSheetStyles(sheet, styles)
}

function measureSheetHeight(sheet: HTMLElement, detent: MobileSheetDetent): number {
  const styles = readInlineSheetStyles(sheet)
  const previousMeasurement = sheet.getAttribute('data-mobile-sheet-measuring')
  sheet.dataset.mobileSheetMeasuring = detent
  sheet.style.height = 'auto'
  sheet.style.maxHeight = detent === 'full' ? 'none' : 'var(--mobile-sheet-max-height)'
  sheet.style.overflow = 'hidden'
  sheet.style.transition = 'none'

  const height = sheet.getBoundingClientRect().height

  if (previousMeasurement === null) {
    sheet.removeAttribute('data-mobile-sheet-measuring')
  } else {
    sheet.setAttribute('data-mobile-sheet-measuring', previousMeasurement)
  }
  restoreInlineSheetStyles(sheet, styles)
  return height
}

function resistOverdrag(distance: number): number {
  return MAX_OVERDRAG * (1 - Math.exp(-distance / MAX_OVERDRAG))
}

function interpolateBottom(stops: readonly DragStop[], height: number): number {
  for (let index = 1; index < stops.length; index += 1) {
    const lower = stops[index - 1]
    const upper = stops[index]
    if (height > upper.height) continue
    if (upper.height === lower.height) return upper.bottom
    const progress = (height - lower.height) / (upper.height - lower.height)
    return lower.bottom + (upper.bottom - lower.bottom) * progress
  }
  return stops.at(-1)?.bottom ?? 0
}

function nearestStop(stops: readonly DragStop[], height: number): DragStop {
  return stops.reduce((nearest, stop) => (
    Math.abs(stop.height - height) < Math.abs(nearest.height - height) ? stop : nearest
  ))
}

function getBottomInset(detent: MobileSheetDetent): number {
  if (detent === 'full') return 0
  const tabBar = document.querySelector<HTMLElement>('.mobile-tab-bar')
  return tabBar?.getBoundingClientRect().height ?? 0
}

function updateDragHeight(session: DragSession, clientY: number): void {
  const distance = session.startY - clientY
  if (!session.moved && Math.abs(distance) < DRAG_THRESHOLD) return

  session.moved = true
  const requestedHeight = session.startHeight + distance
  const minHeight = session.stops[0].height
  const maxHeight = session.stops.at(-1)?.height ?? minHeight
  const height = requestedHeight < minHeight
    ? minHeight - resistOverdrag(minHeight - requestedHeight)
    : requestedHeight > maxHeight
      ? maxHeight + resistOverdrag(requestedHeight - maxHeight)
      : requestedHeight
  const visibleHeight = Math.max(0, height)

  session.sheet.style.maxHeight = requestedHeight > maxHeight
    ? `calc(var(--mobile-viewport-height) + ${MAX_OVERDRAG}px)`
    : 'var(--mobile-viewport-height)'
  session.currentHeight = height
  session.currentBottom = interpolateBottom(session.stops, visibleHeight)
  session.requestedHeight = requestedHeight
  session.sheet.style.height = `${visibleHeight}px`
  session.sheet.style.bottom = `${session.currentBottom}px`
}

function releasePointer(button: HTMLButtonElement, pointerId: number): void {
  try {
    if (
      typeof button.hasPointerCapture === 'function' &&
      typeof button.releasePointerCapture === 'function' &&
      button.hasPointerCapture(pointerId)
    ) button.releasePointerCapture(pointerId)
  } catch {
    // The pointer may already have been released by the browser.
  }
}

function getInitialDetent(detent: MobileSheetDetent | undefined, expanded: boolean | undefined): MobileSheetDetent {
  if (detent) return detent
  return expanded === false ? 'collapsed' : 'partial'
}

export function MobileSheetHandle({
  detent: passedDetent,
  expanded,
  label,
  controlsId,
  onButtonRef,
  onBeforeClick,
  onDetentChange,
  onExpandedChange,
}: MobileSheetHandleProps) {
  const detent = getInitialDetent(passedDetent, expanded)
  const dragRef = useRef<DragSession | null>(null)
  const settlingRef = useRef<DragSession | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const clickSuppressionTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  const changeDetent = useCallback((nextDetent: MobileSheetDetent): void => {
    if (onDetentChange) onDetentChange(nextDetent)
    else onExpandedChange?.(isOpenMobileSheetDetent(nextDetent))
  }, [onDetentChange, onExpandedChange])

  const assignButtonRef = useCallback((button: HTMLButtonElement | null): void => {
    onButtonRef?.(button)
  }, [onButtonRef])

  const clearSettling = useCallback((): void => {
    const session = settlingRef.current
    if (!session) return
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    restoreSheet(session.sheet, session.styles)
    settlingRef.current = null
  }, [])

  const cancelDrag = useCallback((): void => {
    const session = dragRef.current
    if (!session) return
    dragRef.current = null
    releasePointer(session.button, session.pointerId)
    restoreSheet(session.sheet, session.styles)
  }, [])

  useEffect(() => () => {
    cancelDrag()
    clearSettling()
    if (clickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clickSuppressionTimerRef.current)
    }
  }, [cancelDrag, clearSettling])

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || event.isPrimary === false) return
    clearSettling()

    const sheet = event.currentTarget.closest<HTMLElement>('[data-mobile-sheet]')
    if (!sheet) return

    const startHeight = sheet.getBoundingClientRect().height
    const partialHeight = measureSheetHeight(sheet, 'partial')
    const fullHeight = measureSheetHeight(sheet, 'full')
    const collapsedHeight = measureSheetHeight(sheet, 'collapsed')
    if (startHeight <= 0 || fullHeight <= collapsedHeight) return

    const partialBottom = getBottomInset('partial')
    const stops: readonly DragStop[] = [
      { detent: 'collapsed', height: collapsedHeight, bottom: partialBottom },
      { detent: 'partial', height: partialHeight, bottom: partialBottom },
      { detent: 'full', height: fullHeight, bottom: 0 },
    ]

    event.currentTarget.focus()
    const session: DragSession = {
      button: event.currentTarget,
      sheet,
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      stops,
      styles: readInlineSheetStyles(sheet),
      currentHeight: startHeight,
      currentBottom: getBottomInset(detent),
      requestedHeight: startHeight,
      moved: false,
    }

    dragRef.current = session
    sheet.dataset.mobileSheetDragging = 'true'
    sheet.style.height = `${startHeight}px`
    sheet.style.maxHeight = 'var(--mobile-viewport-height)'
    sheet.style.overflow = 'hidden'
    sheet.style.transition = 'none'
    sheet.style.bottom = `${session.currentBottom}px`

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is unavailable in some test and embedded browsers.
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    updateDragHeight(session, event.clientY)
    if (session.moved) event.preventDefault()
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    updateDragHeight(session, event.clientY)
    dragRef.current = null
    releasePointer(session.button, session.pointerId)

    if (!session.moved) {
      restoreSheet(session.sheet, session.styles)
      return
    }

    suppressClickRef.current = true
    if (clickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clickSuppressionTimerRef.current)
    }
    clickSuppressionTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
      clickSuppressionTimerRef.current = null
    }, 0)

    const target = nearestStop(session.stops, session.currentHeight)
    if (target.detent === 'collapsed' && session.sheet.contains(document.activeElement)) {
      session.button.focus()
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const overdragged = session.requestedHeight < session.stops[0].height ||
      session.requestedHeight > (session.stops.at(-1)?.height ?? session.startHeight)
    const duration = prefersReducedMotion
      ? 0
      : overdragged ? OVERDRAG_SETTLE_DURATION : SETTLE_DURATION
    const easing = overdragged && !prefersReducedMotion ? OVERDRAG_SETTLE_EASING : 'ease-out'
    session.sheet.dataset.mobileSheetSettling = target.detent
    session.sheet.style.transition = `height ${duration}ms ${easing}, bottom ${duration}ms ${easing}`
    void session.sheet.getBoundingClientRect().height
    session.sheet.style.height = `${target.height}px`
    session.sheet.style.bottom = `${target.bottom}px`
    changeDetent(target.detent)

    settlingRef.current = session
    settleTimerRef.current = window.setTimeout(() => {
      clearSettling()
    }, duration + 40)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>): void => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    cancelDrag()
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (suppressClickRef.current) {
      event.preventDefault()
      suppressClickRef.current = false
      if (clickSuppressionTimerRef.current !== null) {
        window.clearTimeout(clickSuppressionTimerRef.current)
        clickSuppressionTimerRef.current = null
      }
      return
    }

    clearSettling()
    const nextDetent: MobileSheetDetent = detent === 'partial'
      ? 'full'
      : detent === 'full' ? 'collapsed' : 'partial'
    const content = document.getElementById(controlsId)
    if (nextDetent === 'collapsed' && content?.contains(document.activeElement)) {
      event.currentTarget.focus()
    }
    onBeforeClick?.()
    changeDetent(nextDetent)
  }

  const handleAction = detent === 'full' ? 'Collapse' : 'Expand'

  return (
    <button
      type="button"
      className="mobile-sheet-handle"
      ref={assignButtonRef}
      aria-controls={controlsId}
      aria-expanded={isOpenMobileSheetDetent(detent)}
      aria-label={`${handleAction} ${label}`}
      aria-description={detent === 'partial' ? 'Opens the full-screen sheet.' : undefined}
      data-mobile-sheet-handle
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      <span aria-hidden="true" className="mobile-sheet-grabber" />
    </button>
  )
}

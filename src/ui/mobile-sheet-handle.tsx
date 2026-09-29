import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { interruptMobileSheetAnimation } from './animate-mobile-sheet'
import {
  isOpenMobileSheetDetent,
  type MobileSheetDetent,
  type OpenMobileSheetDetent,
} from './mobile-sheet-detent'

interface MobileSheetHandleProps {
  readonly detent?: MobileSheetDetent
  readonly restoreDetent?: OpenMobileSheetDetent
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
  readonly minHeight: string
  readonly minHeightPriority: string
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
  readonly hiddenContent: readonly { readonly element: HTMLElement; readonly value: string }[]
  currentHeight: number
  currentBottom: number
  moved: boolean
}

const DRAG_THRESHOLD = 6
const SETTLE_DURATION = 220
const SETTLE_EASING = 'cubic-bezier(0.2, 1.15, 0.3, 1)'

function readInlineSheetStyles(sheet: HTMLElement): InlineSheetStyles {
  return {
    height: sheet.style.getPropertyValue('height'),
    heightPriority: sheet.style.getPropertyPriority('height'),
    minHeight: sheet.style.getPropertyValue('min-height'),
    minHeightPriority: sheet.style.getPropertyPriority('min-height'),
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
    ['min-height', styles.minHeight, styles.minHeightPriority],
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

function setInlineSheetHeight(sheet: HTMLElement, height: number): void {
  sheet.style.setProperty('height', `${height}px`, 'important')
}

function setContentHidden(sheet: HTMLElement, hidden: boolean): void {
  for (const content of sheet.querySelectorAll<HTMLElement>('[data-mobile-sheet-content]')) {
    if (hidden) content.setAttribute('hidden', '')
    else content.removeAttribute('hidden')
  }
}

function restoreHiddenContent(
  hiddenContent: DragSession['hiddenContent'],
): void {
  for (const { element, value } of hiddenContent) element.setAttribute('hidden', value)
}

function measureSheetHeight(sheet: HTMLElement, detent: MobileSheetDetent): number {
  const styles = readInlineSheetStyles(sheet)
  const previousMeasurement = sheet.getAttribute('data-mobile-sheet-measuring')
  const previousDetent = sheet.getAttribute('data-detent')
  const previousExpanded = sheet.getAttribute('data-expanded')
  const previousMinimized = sheet.getAttribute('data-minimized')
  const previousTripExpanded = sheet.classList.contains('trip-controls-expanded')
  const previousTripCollapsed = sheet.classList.contains('trip-controls-collapsed')
  const previousContextualMinimized = sheet.classList.contains('contextual-panel-minimized')
  const hiddenContent = Array.from(sheet.querySelectorAll<HTMLElement>('[data-mobile-sheet-content][hidden]'))
    .map((element) => ({ element, hiddenValue: element.getAttribute('hidden') ?? '' }))

  sheet.dataset.mobileSheetMeasuring = detent
  sheet.dataset.detent = detent
  sheet.dataset.expanded = String(detent !== 'collapsed')
  sheet.dataset.minimized = String(detent === 'collapsed')
  sheet.classList.toggle('trip-controls-expanded', detent !== 'collapsed')
  sheet.classList.toggle('trip-controls-collapsed', detent === 'collapsed')
  sheet.classList.toggle('contextual-panel-minimized', detent === 'collapsed')
  if (detent !== 'collapsed') {
    for (const { element } of hiddenContent) element.removeAttribute('hidden')
  }
  sheet.style.height = 'auto'
  sheet.style.maxHeight = detent === 'full' ? 'none' : 'var(--mobile-sheet-max-height)'
  sheet.style.overflow = 'hidden'
  sheet.style.transition = 'none'

  const height = sheet.getBoundingClientRect().height

  if (previousDetent === null) delete sheet.dataset.detent
  else sheet.setAttribute('data-detent', previousDetent)
  if (previousExpanded === null) delete sheet.dataset.expanded
  else sheet.setAttribute('data-expanded', previousExpanded)
  if (previousMinimized === null) delete sheet.dataset.minimized
  else sheet.setAttribute('data-minimized', previousMinimized)
  sheet.classList.toggle('trip-controls-expanded', previousTripExpanded)
  sheet.classList.toggle('trip-controls-collapsed', previousTripCollapsed)
  sheet.classList.toggle('contextual-panel-minimized', previousContextualMinimized)
  for (const { element, hiddenValue } of hiddenContent) element.setAttribute('hidden', hiddenValue)
  if (previousMeasurement === null) {
    sheet.removeAttribute('data-mobile-sheet-measuring')
  } else {
    sheet.setAttribute('data-mobile-sheet-measuring', previousMeasurement)
  }
  restoreInlineSheetStyles(sheet, styles)
  return height
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

function stopForVisibleHeight(stops: readonly DragStop[], height: number): DragStop {
  const viewportHeight = window.visualViewport?.height || window.innerHeight
  const visibleRatio = height / Math.max(viewportHeight, 1)
  if (visibleRatio < 0.3) return stops[0]
  if (visibleRatio <= 0.6) return stops[1]
  return stops.at(-1) ?? stops[0]
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
  const height = Math.min(maxHeight, Math.max(minHeight, requestedHeight))

  session.sheet.style.setProperty('max-height', 'var(--mobile-viewport-height)', 'important')
  session.currentHeight = height
  session.currentBottom = interpolateBottom(session.stops, height)
  setInlineSheetHeight(session.sheet, height)
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
  restoreDetent = 'partial',
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
    restoreHiddenContent(session.hiddenContent)
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

    const animationPosition = interruptMobileSheetAnimation(sheet)
    const startHeight = animationPosition?.height ?? sheet.getBoundingClientRect().height
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
      hiddenContent: Array.from(sheet.querySelectorAll<HTMLElement>('[data-mobile-sheet-content][hidden]'))
        .map((element) => ({ element, value: element.getAttribute('hidden') ?? '' })),
      currentHeight: startHeight,
      currentBottom: animationPosition?.bottom ?? getBottomInset(detent),
      moved: false,
    }

    dragRef.current = session
    sheet.dataset.mobileSheetDragging = 'true'
    for (const { element } of session.hiddenContent) element.removeAttribute('hidden')
    setInlineSheetHeight(sheet, startHeight)
    sheet.style.setProperty('min-height', `${collapsedHeight}px`, 'important')
    sheet.style.setProperty('max-height', 'var(--mobile-viewport-height)', 'important')
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
      restoreHiddenContent(session.hiddenContent)
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

    const target = stopForVisibleHeight(session.stops, session.currentHeight)
    setContentHidden(session.sheet, target.detent === 'collapsed')
    if (target.detent === 'collapsed' && session.sheet.contains(document.activeElement)) {
      session.button.focus()
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = prefersReducedMotion ? 0 : SETTLE_DURATION
    const easing = prefersReducedMotion ? 'ease-out' : SETTLE_EASING
    session.sheet.dataset.mobileSheetSettling = target.detent
    session.sheet.style.transition = `height ${duration}ms ${easing}, bottom ${duration}ms ${easing}`
    void session.sheet.getBoundingClientRect().height
    setInlineSheetHeight(session.sheet, target.height)
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
    const nextDetent: MobileSheetDetent = detent === 'collapsed'
      ? restoreDetent
      : detent === 'partial' ? 'full' : 'collapsed'
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

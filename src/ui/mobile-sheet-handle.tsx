import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

interface MobileSheetHandleProps {
  readonly expanded: boolean
  readonly label: string
  readonly controlsId: string
  readonly onButtonRef?: (button: HTMLButtonElement | null) => void
  readonly onExpandedChange: (expanded: boolean) => void
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
}

interface DragSession {
  readonly button: HTMLButtonElement
  readonly sheet: HTMLElement
  readonly pointerId: number
  readonly startY: number
  readonly startHeight: number
  readonly compactHeight: number
  readonly expandedHeight: number
  readonly styles: InlineSheetStyles
  currentHeight: number
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
  }
}

function restoreInlineSheetStyles(sheet: HTMLElement, styles: InlineSheetStyles): void {
  const entries = [
    ['height', styles.height, styles.heightPriority],
    ['max-height', styles.maxHeight, styles.maxHeightPriority],
    ['overflow', styles.overflow, styles.overflowPriority],
    ['transition', styles.transition, styles.transitionPriority],
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

function measureSheetHeight(sheet: HTMLElement, state: 'compact' | 'expanded'): number {
  const styles = readInlineSheetStyles(sheet)
  const previousMeasurement = sheet.getAttribute('data-mobile-sheet-measuring')
  sheet.dataset.mobileSheetMeasuring = state
  sheet.style.height = 'auto'
  sheet.style.maxHeight = 'var(--mobile-sheet-max-height)'
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

function updateDragHeight(session: DragSession, clientY: number): void {
  const distance = session.startY - clientY
  if (!session.moved && Math.abs(distance) < DRAG_THRESHOLD) return

  session.moved = true
  const requestedHeight = session.startHeight + distance
  let height = requestedHeight
  if (requestedHeight < session.compactHeight) {
    height = session.compactHeight - resistOverdrag(session.compactHeight - requestedHeight)
  } else if (requestedHeight > session.expandedHeight) {
    height = session.expandedHeight + resistOverdrag(requestedHeight - session.expandedHeight)
  }

  session.sheet.style.maxHeight = requestedHeight > session.expandedHeight
    ? `calc(var(--mobile-sheet-max-height) + ${MAX_OVERDRAG}px)`
    : 'var(--mobile-sheet-max-height)'
  session.currentHeight = height
  session.sheet.style.height = `${height}px`
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

export function MobileSheetHandle({
  expanded,
  label,
  controlsId,
  onButtonRef,
  onExpandedChange,
}: MobileSheetHandleProps) {
  const dragRef = useRef<DragSession | null>(null)
  const settlingRef = useRef<DragSession | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const clickSuppressionTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

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
    const compactHeight = measureSheetHeight(sheet, 'compact')
    const expandedHeight = measureSheetHeight(sheet, 'expanded')
    if (startHeight <= 0 || compactHeight <= 0 || expandedHeight <= compactHeight) return

    event.currentTarget.focus()
    const session: DragSession = {
      button: event.currentTarget,
      sheet,
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      compactHeight,
      expandedHeight,
      styles: readInlineSheetStyles(sheet),
      currentHeight: startHeight,
      moved: false,
    }

    dragRef.current = session
    sheet.dataset.mobileSheetDragging = 'true'
    sheet.style.height = `${startHeight}px`
    sheet.style.maxHeight = 'var(--mobile-sheet-max-height)'
    sheet.style.overflow = 'hidden'
    sheet.style.transition = 'none'

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

    const nextExpanded = session.currentHeight >=
      (session.compactHeight + session.expandedHeight) / 2
    if (!nextExpanded && session.sheet.contains(document.activeElement)) {
      session.button.focus()
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const overdragged = session.currentHeight < session.compactHeight ||
      session.currentHeight > session.expandedHeight
    const duration = prefersReducedMotion
      ? 0
      : overdragged ? OVERDRAG_SETTLE_DURATION : SETTLE_DURATION
    const easing = overdragged && !prefersReducedMotion ? OVERDRAG_SETTLE_EASING : 'ease-out'
    const targetHeight = nextExpanded ? session.expandedHeight : session.compactHeight
    session.sheet.dataset.mobileSheetSettling = nextExpanded ? 'expanded' : 'compact'
    session.sheet.style.transition = `height ${duration}ms ${easing}`
    void session.sheet.getBoundingClientRect().height
    session.sheet.style.height = `${targetHeight}px`
    onExpandedChange(nextExpanded)

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
    const nextExpanded = !expanded
    const content = document.getElementById(controlsId)
    if (!nextExpanded && content?.contains(document.activeElement)) {
      event.currentTarget.focus()
    }
    onExpandedChange(nextExpanded)
  }

  return (
    <button
      type="button"
      className="mobile-sheet-handle"
      ref={assignButtonRef}
      aria-controls={controlsId}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
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

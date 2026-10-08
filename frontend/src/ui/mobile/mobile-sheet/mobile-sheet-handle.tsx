import { useCallback, useEffect, useRef, type MouseEvent } from 'react'
import { interruptMobileSheetAnimation } from './animate-mobile-sheet'
import { getMobileTabBarInset } from './mobile-sheet-layout'
import {
  isOpenMobileSheetDetent,
  type MobileSheetDetent,
  type OpenMobileSheetDetent,
} from './mobile-sheet-detent'

interface MobileSheetHandleProps {
  readonly detent?: MobileSheetDetent
  readonly restoreDetent?: OpenMobileSheetDetent
  readonly label: string
  readonly controlsId: string
  readonly onButtonRef?: (button: HTMLButtonElement | null) => void
  readonly onBeforeClick?: () => void
  readonly onDetentChange?: (detent: MobileSheetDetent) => void
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
  readonly top: string
  readonly topPriority: string
  readonly bottom: string
  readonly bottomPriority: string
}

interface DragStop {
  readonly detent: MobileSheetDetent
  readonly height: number
  readonly bottom: number
}

interface HiddenSheetContent {
  readonly element: HTMLElement
  readonly value: string
}

interface DragSession {
  readonly button: HTMLButtonElement
  readonly sheet: HTMLElement
  readonly captureTarget: HTMLElement | null
  readonly pointerId: number
  readonly startDetent: MobileSheetDetent
  readonly startY: number
  readonly startHeight: number
  readonly stops: readonly DragStop[]
  readonly styles: InlineSheetStyles
  readonly hiddenContent: readonly HiddenSheetContent[]
  currentHeight: number
  currentBottom: number
  moved: boolean
}

const DRAG_THRESHOLD = 6
const DETENT_CHANGE_THRESHOLD = 24
const SETTLE_DURATION = 220
const SETTLE_EASING = 'cubic-bezier(0.2, 1.15, 0.3, 1)'

function provideSheetSnapFeedback(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(10)
}

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
    top: sheet.style.getPropertyValue('top'),
    topPriority: sheet.style.getPropertyPriority('top'),
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
    ['top', styles.top, styles.topPriority],
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

function readHiddenSheetContent(sheet: HTMLElement): HiddenSheetContent[] {
  return Array.from(sheet.querySelectorAll<HTMLElement>('.navigation-panel-content[hidden]'))
    .filter((element) => !element.parentElement?.closest('.navigation-panel-content'))
    .map((element) => ({ element, value: element.getAttribute('hidden') ?? '' }))
}

function restoreHiddenContent(hiddenContent: readonly HiddenSheetContent[]): void {
  for (const { element, value } of hiddenContent) element.setAttribute('hidden', value)
}

function measureSheetHeight(sheet: HTMLElement, detent: MobileSheetDetent): number {
  const styles = readInlineSheetStyles(sheet)
  const previousMeasurement = sheet.getAttribute('data-mobile-sheet-measuring')
  const previousDetent = sheet.getAttribute('data-detent')
  const hiddenContent = readHiddenSheetContent(sheet)

  sheet.dataset.mobileSheetMeasuring = detent
  sheet.dataset.detent = detent
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
  restoreHiddenContent(hiddenContent)
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

function isBelowCollapsedHeight(height: number): boolean {
  const viewportHeight = window.visualViewport?.height || window.innerHeight
  const visibleRatio = height / Math.max(viewportHeight, 1)
  return visibleRatio < 0.3
}

function stopForDragRelease(session: DragSession): DragStop {
  const heightChange = session.currentHeight - session.startHeight
  const stopFor = (detent: MobileSheetDetent): DragStop => (
    session.stops.find((stop) => stop.detent === detent) ?? session.stops[0]
  )

  if (session.startDetent === 'partial') {
    if (heightChange >= DETENT_CHANGE_THRESHOLD) return stopFor('full')
    if (heightChange <= -DETENT_CHANGE_THRESHOLD) return stopFor('collapsed')
    return stopFor('partial')
  }

  if (session.startDetent === 'collapsed') {
    return heightChange >= DETENT_CHANGE_THRESHOLD ? stopFor('partial') : stopFor('collapsed')
  }

  if (isBelowCollapsedHeight(session.currentHeight)) return stopFor('collapsed')
  return heightChange <= -DETENT_CHANGE_THRESHOLD ? stopFor('partial') : stopFor('full')
}

function getBottomInset(sheet: HTMLElement): number {
  const shell = sheet.closest<HTMLElement>('.map-shell')
  const tabBar = shell?.querySelector<HTMLElement>('.main-navigation')
  const tabBarRect = tabBar?.getBoundingClientRect()
  if (!shell) return tabBarRect?.height ?? 0

  const shellBottom = shell.getBoundingClientRect().bottom
  const cssInset = Number.parseFloat(window.getComputedStyle(shell, '::after').height)

  return getMobileTabBarInset(
    shellBottom,
    tabBarRect ? { top: tabBarRect.top, height: tabBarRect.height } : null,
    Number.isFinite(cssInset) ? cssInset : tabBarRect?.height ?? 0,
  )
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

function releasePointer(target: HTMLElement | null, pointerId: number): void {
  if (!target) return
  try {
    if (
      typeof target.hasPointerCapture === 'function' &&
      typeof target.releasePointerCapture === 'function' &&
      target.hasPointerCapture(pointerId)
    ) target.releasePointerCapture(pointerId)
  } catch {
    // The pointer may already have been released by the browser.
  }
}

function getInitialDetent(detent: MobileSheetDetent | undefined): MobileSheetDetent {
  return detent ?? 'partial'
}

const NON_DRAG_SHEET_TARGETS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-mobile-sheet-no-drag]',
].join(',')

function isPointOnText(
  sheet: HTMLElement,
  clientX: number,
  clientY: number,
  fallbackTarget: Element,
): boolean {
  const doc = sheet.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (!doc.caretPositionFromPoint && !doc.caretRangeFromPoint) {
    return Boolean(fallbackTarget.textContent?.trim())
  }
  const caret = doc.caretPositionFromPoint?.(clientX, clientY)
  const range = caret ? null : doc.caretRangeFromPoint?.(clientX, clientY)
  const node = caret?.offsetNode ?? range?.startContainer
  const offset = caret?.offset ?? range?.startOffset
  if (!node || offset === undefined || node.nodeType !== Node.TEXT_NODE || !sheet.contains(node)) return false

  const text = node.textContent ?? ''
  if (!text.trim()) return false
  const characterIndex = Math.min(Math.max(offset, 0), text.length - 1)
  if (!text[characterIndex]?.trim()) return false

  const characterRange = doc.createRange()
  characterRange.setStart(node, characterIndex)
  characterRange.setEnd(node, characterIndex + 1)
  return Array.from(characterRange.getClientRects()).some((rect) => (
    rect.width > 0 && rect.height > 0 &&
    clientX >= rect.left && clientX <= rect.right &&
    clientY >= rect.top && clientY <= rect.bottom
  ))
}

function isWhitespaceSheetTarget(
  sheet: HTMLElement,
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number,
): boolean {
  const target = eventTarget instanceof Element ? eventTarget : null
  if (!target || target.closest('[data-mobile-sheet-handle], .navigation-panel-scroll-content')) return false
  if (target.closest(NON_DRAG_SHEET_TARGETS)) return false

  for (let element: Element | null = target; element && element !== sheet; element = element.parentElement) {
    if (!(element instanceof HTMLElement)) continue
    const style = window.getComputedStyle(element)
    if (/^(auto|scroll|overlay)$/.test(style.overflowY) || /^(auto|scroll|overlay)$/.test(style.overflowX)) {
      return false
    }
  }

  return !isPointOnText(sheet, clientX, clientY, target)
}

export function MobileSheetHandle({
  detent: passedDetent,
  restoreDetent = 'partial',
  label,
  controlsId,
  onButtonRef,
  onBeforeClick,
  onDetentChange,
}: MobileSheetHandleProps) {
  const detent = getInitialDetent(passedDetent)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const settlingRef = useRef<DragSession | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const clickSuppressionTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  const changeDetent = useCallback((nextDetent: MobileSheetDetent): void => {
    if (onDetentChange) onDetentChange(nextDetent)
  }, [onDetentChange])

  const assignButtonRef = useCallback((button: HTMLButtonElement | null): void => {
    buttonRef.current = button
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
    releasePointer(session.captureTarget, session.pointerId)
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

  const beginDrag = useCallback((
    pointerId: number,
    clientY: number,
    sheet: HTMLElement,
    button: HTMLButtonElement,
    captureTarget: HTMLElement | null,
    focusButton: boolean,
  ): void => {
    clearSettling()
    const animationPosition = interruptMobileSheetAnimation(sheet)
    const startHeight = animationPosition?.height ?? sheet.getBoundingClientRect().height
    const partialHeight = measureSheetHeight(sheet, 'partial')
    const fullHeight = measureSheetHeight(sheet, 'full')
    const collapsedHeight = measureSheetHeight(sheet, 'collapsed')
    if (startHeight <= 0 || fullHeight <= collapsedHeight) return

    const tabBarInset = getBottomInset(sheet)
    const stops: readonly DragStop[] = [
      { detent: 'collapsed', height: collapsedHeight, bottom: tabBarInset },
      { detent: 'partial', height: partialHeight, bottom: tabBarInset },
      { detent: 'full', height: fullHeight, bottom: tabBarInset },
    ]

    if (focusButton) button.focus()
    const session: DragSession = {
      button,
      sheet,
      captureTarget,
      pointerId,
      startDetent: detent,
      startY: clientY,
      startHeight,
      stops,
      styles: readInlineSheetStyles(sheet),
      hiddenContent: readHiddenSheetContent(sheet),
      currentHeight: startHeight,
      currentBottom: animationPosition?.bottom ?? getBottomInset(sheet),
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
    sheet.style.setProperty('top', 'auto', 'important')
    sheet.style.bottom = `${session.currentBottom}px`

    if (captureTarget) {
      try {
        captureTarget.setPointerCapture(pointerId)
      } catch {
        // Pointer capture is unavailable in some test and embedded browsers.
      }
    }
  }, [clearSettling, detent])

  const moveDrag = useCallback((
    pointerId: number,
    clientY: number,
    preventDefault: () => void,
  ): void => {
    const session = dragRef.current
    if (!session || session.pointerId !== pointerId) return
    updateDragHeight(session, clientY)
    if (session.moved) preventDefault()
  }, [])

  const finishDrag = useCallback((pointerId: number, clientY: number): void => {
    const session = dragRef.current
    if (!session || session.pointerId !== pointerId) return
    updateDragHeight(session, clientY)
    dragRef.current = null
    releasePointer(session.captureTarget, session.pointerId)

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

    const target = stopForDragRelease(session)
    if (target.detent !== session.startDetent) provideSheetSnapFeedback()
    if (target.detent === 'collapsed') {
      session.sheet.removeAttribute('data-mobile-sheet-dragging')
      restoreHiddenContent(session.hiddenContent)
    }
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
  }, [changeDetent, clearSettling])

  useEffect(() => {
    const button = buttonRef.current
    const sheet = button?.closest<HTMLElement>('[data-mobile-sheet]')
    if (!button || !sheet) return

    const handleSheetPointerDown = (event: globalThis.PointerEvent): void => {
      if (event.button !== 0 || event.isPrimary === false) return
      const startedOnHandle = event.target instanceof Node && button.contains(event.target)
      if (event.pointerType === 'touch' && !startedOnHandle) return
      if (!startedOnHandle && !isWhitespaceSheetTarget(sheet, event.target, event.clientX, event.clientY)) return
      beginDrag(
        event.pointerId,
        event.clientY,
        sheet,
        button,
        startedOnHandle ? button : sheet,
        startedOnHandle,
      )
    }
    const handleSheetPointerMove = (event: globalThis.PointerEvent): void => {
      if (event.pointerType === 'touch' && dragRef.current?.captureTarget === null) return
      if (dragRef.current?.sheet !== sheet) return
      moveDrag(event.pointerId, event.clientY, () => event.preventDefault())
    }
    const handleSheetPointerUp = (event: globalThis.PointerEvent): void => {
      if (event.pointerType === 'touch' && dragRef.current?.captureTarget === null) return
      if (dragRef.current?.sheet !== sheet) return
      finishDrag(event.pointerId, event.clientY)
    }
    const handleSheetPointerCancel = (event: globalThis.PointerEvent): void => {
      const session = dragRef.current
      if (event.pointerType === 'touch' && session?.captureTarget === null) return
      if (session?.sheet !== sheet || session.pointerId !== event.pointerId) return
      cancelDrag()
    }

    sheet.addEventListener('pointerdown', handleSheetPointerDown)
    sheet.addEventListener('pointermove', handleSheetPointerMove)
    sheet.addEventListener('pointerup', handleSheetPointerUp)
    sheet.addEventListener('pointercancel', handleSheetPointerCancel)

    let touchPointerId: number | null = null
    const handleSheetTouchStart = (event: TouchEvent): void => {
      if (event.touches.length > 1) {
        if (touchPointerId !== null) {
          touchPointerId = null
          cancelDrag()
        }
        return
      }
      if (touchPointerId !== null || event.touches.length !== 1) return
      const touch = event.changedTouches[0]
      if (!touch || !isWhitespaceSheetTarget(sheet, event.target, touch.clientX, touch.clientY)) return
      touchPointerId = touch.identifier
      beginDrag(touch.identifier, touch.clientY, sheet, button, null, false)
    }
    const handleSheetTouchMove = (event: TouchEvent): void => {
      if (touchPointerId === null) return
      const touch = Array.from(event.changedTouches).find(({ identifier }) => identifier === touchPointerId)
      if (!touch) return
      moveDrag(touchPointerId, touch.clientY, () => event.preventDefault())
    }
    const handleSheetTouchEnd = (event: TouchEvent): void => {
      if (touchPointerId === null) return
      const touch = Array.from(event.changedTouches).find(({ identifier }) => identifier === touchPointerId)
      if (!touch) return
      finishDrag(touchPointerId, touch.clientY)
      touchPointerId = null
    }
    const handleSheetTouchCancel = (): void => {
      if (touchPointerId === null) return
      touchPointerId = null
      cancelDrag()
    }

    sheet.addEventListener('touchstart', handleSheetTouchStart, { passive: true })
    sheet.addEventListener('touchmove', handleSheetTouchMove, { passive: false })
    sheet.addEventListener('touchend', handleSheetTouchEnd)
    sheet.addEventListener('touchcancel', handleSheetTouchCancel)
    return () => {
      sheet.removeEventListener('pointerdown', handleSheetPointerDown)
      sheet.removeEventListener('pointermove', handleSheetPointerMove)
      sheet.removeEventListener('pointerup', handleSheetPointerUp)
      sheet.removeEventListener('pointercancel', handleSheetPointerCancel)
      sheet.removeEventListener('touchstart', handleSheetTouchStart)
      sheet.removeEventListener('touchmove', handleSheetTouchMove)
      sheet.removeEventListener('touchend', handleSheetTouchEnd)
      sheet.removeEventListener('touchcancel', handleSheetTouchCancel)
    }
  }, [beginDrag, cancelDrag, finishDrag, moveDrag])

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
    if (nextDetent !== detent) provideSheetSnapFeedback()
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
      aria-description={detent === 'partial' ? 'Opens the full-height sheet.' : undefined}
      data-mobile-sheet-handle
      data-mobile-sheet-restore-detent={restoreDetent}
      onClick={handleClick}
    >
      <span aria-hidden="true" className="mobile-sheet-grabber" />
    </button>
  )
}

const SHEET_TRANSITION_DURATION = 220
const SHEET_TRANSITION_EASING = 'ease-out'
const activeAnimations = new WeakMap<HTMLElement, () => void>()

function getSheetTransitionDuration(sheet: HTMLElement): number {
  const token = window.getComputedStyle(sheet).getPropertyValue?.('--motion-duration-panel')
  const duration = Number.parseFloat(token ?? '')
  return Number.isFinite(duration) ? duration : SHEET_TRANSITION_DURATION
}

function getSheetTransitionEasing(sheet: HTMLElement): string {
  const token = window.getComputedStyle(sheet).getPropertyValue?.('--motion-ease-standard').trim()
  return token || SHEET_TRANSITION_EASING
}

export interface MobileSheetAnimationPosition {
  readonly height: number
  readonly bottom?: number
}

interface InlineSheetStyles {
  readonly height: string
  readonly heightPriority: string
  readonly top: string
  readonly topPriority: string
  readonly maxHeight: string
  readonly overflow: string
  readonly transition: string
  readonly bottom: string
}

function readInlineStyles(sheet: HTMLElement): InlineSheetStyles {
  return {
    height: sheet.style.getPropertyValue('height'),
    heightPriority: sheet.style.getPropertyPriority('height'),
    top: sheet.style.getPropertyValue('top'),
    topPriority: sheet.style.getPropertyPriority('top'),
    maxHeight: sheet.style.maxHeight,
    overflow: sheet.style.overflow,
    transition: sheet.style.transition,
    bottom: sheet.style.bottom,
  }
}

export function animateMobileSheet(
  sheet: HTMLElement,
  startHeight: number,
  animateContent: boolean,
  startBottom?: number,
): () => void {
  activeAnimations.get(sheet)?.()
  if (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined

  const previous = readInlineStyles(sheet)
  sheet.dataset.mobileSheetAnimating = 'true'
  const targetHeight = sheet.getBoundingClientRect().height
  const targetBottom = window.getComputedStyle(sheet).bottom
  if (startHeight <= 0 && targetHeight <= 0) {
    delete sheet.dataset.mobileSheetAnimating
    return () => undefined
  }

  let frame = 0
  let timeout = 0
  let finished = false

  function finish(): void {
    if (finished) return
    finished = true
    if (activeAnimations.get(sheet) === finish) activeAnimations.delete(sheet)
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
    sheet.removeEventListener('transitionend', handleTransitionEnd)
    delete sheet.dataset.mobileSheetAnimating
    delete sheet.dataset.mobileSheetViewTransition
    if (previous.height) {
      sheet.style.setProperty('height', previous.height, previous.heightPriority)
    } else {
      sheet.style.removeProperty('height')
    }
    if (previous.top) {
      sheet.style.setProperty('top', previous.top, previous.topPriority)
    } else {
      sheet.style.removeProperty('top')
    }
    sheet.style.maxHeight = previous.maxHeight
    sheet.style.overflow = previous.overflow
    sheet.style.transition = previous.transition
    sheet.style.bottom = previous.bottom
  }

  const handleTransitionEnd = (event: TransitionEvent): void => {
    if (event.target === sheet && event.propertyName === 'height') finish()
  }

  if (animateContent) sheet.dataset.mobileSheetViewTransition = 'true'
  sheet.style.setProperty('height', `${startHeight}px`, 'important')
  sheet.style.maxHeight = sheet.dataset.detent === 'partial'
    ? 'var(--mobile-sheet-max-height)'
    : 'var(--mobile-viewport-height)'
  sheet.style.overflow = 'hidden'
  sheet.style.transition = 'none'
  sheet.style.setProperty('top', 'auto', 'important')
  if (startBottom !== undefined) sheet.style.bottom = `${startBottom}px`
  void sheet.getBoundingClientRect().height

  const duration = getSheetTransitionDuration(sheet)
  const easing = getSheetTransitionEasing(sheet)

  sheet.addEventListener('transitionend', handleTransitionEnd)
  frame = window.requestAnimationFrame(() => {
    sheet.style.transition = `height ${duration}ms ${easing}, bottom ${duration}ms ${easing}`
    sheet.style.setProperty('height', `${targetHeight}px`, 'important')
    sheet.style.bottom = targetBottom
  })
  timeout = window.setTimeout(finish, duration + 80)
  activeAnimations.set(sheet, finish)
  return finish
}

export function interruptMobileSheetAnimation(sheet: HTMLElement): MobileSheetAnimationPosition | null {
  const finish = activeAnimations.get(sheet)
  if (!finish) return null

  const height = sheet.getBoundingClientRect().height
  const bottom = Number.parseFloat(window.getComputedStyle(sheet).bottom)
  finish()

  return Number.isFinite(bottom) ? { height, bottom } : { height }
}

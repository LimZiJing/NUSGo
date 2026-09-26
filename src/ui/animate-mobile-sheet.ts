const SHEET_TRANSITION_DURATION = 220

interface InlineSheetStyles {
  readonly height: string
  readonly maxHeight: string
  readonly overflow: string
  readonly transition: string
}

function readInlineStyles(sheet: HTMLElement): InlineSheetStyles {
  return {
    height: sheet.style.height,
    maxHeight: sheet.style.maxHeight,
    overflow: sheet.style.overflow,
    transition: sheet.style.transition,
  }
}

export function animateMobileSheet(
  sheet: HTMLElement,
  startHeight: number,
  animateContent: boolean,
): () => void {
  if (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined

  const targetHeight = sheet.getBoundingClientRect().height
  if (startHeight <= 0 || targetHeight <= 0) return () => undefined

  const previous = readInlineStyles(sheet)
  let frame = 0
  let timeout = 0
  let finished = false

  const finish = (): void => {
    if (finished) return
    finished = true
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
    sheet.removeEventListener('transitionend', handleTransitionEnd)
    delete sheet.dataset.mobileSheetAnimating
    delete sheet.dataset.mobileSheetViewTransition
    sheet.style.height = previous.height
    sheet.style.maxHeight = previous.maxHeight
    sheet.style.overflow = previous.overflow
    sheet.style.transition = previous.transition
  }

  const handleTransitionEnd = (event: TransitionEvent): void => {
    if (event.target === sheet && event.propertyName === 'height') finish()
  }

  sheet.dataset.mobileSheetAnimating = 'true'
  if (animateContent) sheet.dataset.mobileSheetViewTransition = 'true'
  sheet.style.height = `${startHeight}px`
  sheet.style.maxHeight = 'var(--mobile-sheet-max-height)'
  sheet.style.overflow = 'hidden'
  sheet.style.transition = 'none'
  void sheet.getBoundingClientRect().height

  sheet.addEventListener('transitionend', handleTransitionEnd)
  frame = window.requestAnimationFrame(() => {
    sheet.style.transition = `height ${SHEET_TRANSITION_DURATION}ms ease-out`
    sheet.style.height = `${targetHeight}px`
  })
  timeout = window.setTimeout(finish, SHEET_TRANSITION_DURATION + 80)
  return finish
}

import { MAP_OVERLAY_MARGIN } from '../map-camera'

const PRESENTATION_INSET = '--map-sheet-presentation-bottom-inset'
const CROSSHAIR_OCCLUSION_CLASS = 'map-sheet-occludes-crosshair'
const CONTENT_MOTION_ATTRIBUTE = 'data-content-motion-suppressed'

export interface MobileSheetPresentationScheduler {
  requestAnimationFrame(callback: FrameRequestCallback): number
  cancelAnimationFrame(id: number): void
}

/** Tracks rendered sheet geometry only while a pointer drag or transform transition is active. */
export function observeMobileSheetPresentation(
  shell: HTMLElement,
  sheet: HTMLElement,
  scheduler: MobileSheetPresentationScheduler = window,
  presentationTarget: HTMLElement = shell,
  onBottomInsetChange?: (bottom: number | null) => void,
): () => void {
  let frame: number | null = null
  let dragging = false
  let transitioning = false
  let shellBottom = 0
  let shellTop = 0
  let lastInset: number | null = null
  let lastPublishedInset: number | null = null
  let lastOccluded: boolean | null = null
  let presentationActive = false
  let contentMotionFrame: number | null = null

  const measureShell = (): void => {
    const bounds = shell.getBoundingClientRect()
    shellBottom = bounds.bottom
    shellTop = bounds.top
  }

  const measure = (): void => {
    const sheetBounds = sheet.getBoundingClientRect()
    const bottomInset = Math.max(0, shellBottom - sheetBounds.top + MAP_OVERLAY_MARGIN)
    if (dragging && lastInset !== null && bottomInset !== lastInset) {
      sheet.setAttribute(CONTENT_MOTION_ATTRIBUTE, '')
    }
    if (bottomInset !== lastInset) {
      presentationTarget.style.setProperty(PRESENTATION_INSET, `${bottomInset}px`)
      lastInset = bottomInset
    }
    if (bottomInset !== lastPublishedInset) {
      lastPublishedInset = bottomInset
      onBottomInsetChange?.(bottomInset)
    }
    // Leave room for the 6px dot and its 3px halo above the sheet's map margin.
    const occluded = sheetBounds.top - shellTop <= MAP_OVERLAY_MARGIN + 12
    if (occluded !== lastOccluded) {
      presentationTarget.classList.toggle(CROSSHAIR_OCCLUSION_CLASS, occluded)
      lastOccluded = occluded
    }
  }

  const finishPresentation = (): void => {
    if (!presentationActive) return
    presentationActive = false
    // Keep the marker through the transition-end frame, when map-centre updates
    // may still cause Nearby cards to expand or collapse.
    if (contentMotionFrame !== null) scheduler.cancelAnimationFrame(contentMotionFrame)
    contentMotionFrame = scheduler.requestAnimationFrame(() => {
      contentMotionFrame = null
      if (!presentationActive) sheet.removeAttribute(CONTENT_MOTION_ATTRIBUTE)
    })
    if (lastPublishedInset !== null) onBottomInsetChange?.(null)
    lastPublishedInset = null
  }

  const stop = (): void => {
    if (frame !== null) scheduler.cancelAnimationFrame(frame)
    frame = null
  }

  const tick = (): void => {
    frame = null
    measure()
    // A mutation frame can run before transitionrun is dispatched. Do not
    // restore target padding while the CSS transform is already starting.
    if (!dragging && !transitioning) {
      transitioning = sheet.getAnimations?.().some((animation) => (
        'transitionProperty' in animation && animation.transitionProperty === 'transform' && animation.playState === 'running'
      )) ?? false
    }
    if (dragging || transitioning) {
      frame = scheduler.requestAnimationFrame(tick)
      return
    }
    finishPresentation()
  }

  const start = (): void => {
    if (frame !== null) return
    frame = scheduler.requestAnimationFrame(tick)
  }

  const onPointerDown = (): void => {
    dragging = true
    presentationActive = true
    start()
  }

  const onPointerEnd = (): void => {
    dragging = false
    start()
  }

  const onTransitionRun = (event: TransitionEvent): void => {
    if (event.target !== sheet || event.propertyName !== 'transform') return
    transitioning = true
    presentationActive = true
    sheet.setAttribute(CONTENT_MOTION_ATTRIBUTE, '')
    start()
  }

  const onTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== sheet || event.propertyName !== 'transform') return
    transitioning = false
    measure()
    if (!dragging) {
      stop()
      finishPresentation()
    }
  }

  const onTransitionCancel = (event: TransitionEvent): void => {
    if (event.target !== sheet || event.propertyName !== 'transform') return
    transitioning = sheet.getAnimations?.().some((animation) => (
      'transitionProperty' in animation && animation.transitionProperty === 'transform' && animation.playState === 'running'
    )) ?? false
    if (!dragging && !transitioning) {
      measure()
      start()
    }
  }

  sheet.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
  sheet.addEventListener('transitionrun', onTransitionRun)
  sheet.addEventListener('transitionend', onTransitionEnd)
  sheet.addEventListener('transitioncancel', onTransitionCancel)
  const onResize = (): void => {
    measureShell()
    measure()
  }
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
  resizeObserver?.observe(shell)
  resizeObserver?.observe(sheet, { box: 'border-box' })
  // Zero-duration transitions emit no transition events (including reduced motion).
  // Observe only the sheet, so presentation writes cannot retrigger this.
  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
    presentationActive = true
    start()
  })
  mutationObserver?.observe(sheet, { attributes: true, attributeFilter: ['style', 'data-detent'] })
  measureShell()
  measure()

  return () => {
    stop()
    if (contentMotionFrame !== null) scheduler.cancelAnimationFrame(contentMotionFrame)
    sheet.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
    sheet.removeEventListener('transitionrun', onTransitionRun)
    sheet.removeEventListener('transitionend', onTransitionEnd)
    sheet.removeEventListener('transitioncancel', onTransitionCancel)
    window.removeEventListener('resize', onResize)
    window.visualViewport?.removeEventListener('resize', onResize)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    sheet.removeAttribute(CONTENT_MOTION_ATTRIBUTE)
    if (lastPublishedInset !== null) onBottomInsetChange?.(null)
    presentationTarget.style.removeProperty(PRESENTATION_INSET)
    presentationTarget.classList.remove(CROSSHAIR_OCCLUSION_CLASS)
  }
}

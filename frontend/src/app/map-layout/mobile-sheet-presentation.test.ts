// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeMobileSheetPresentation, type MobileSheetPresentationScheduler } from './mobile-sheet-presentation'

function setup() {
  const shell = document.createElement('div')
  const presentationTarget = document.createElement('div')
  const sheet = document.createElement('section')
  shell.append(presentationTarget, sheet)
  document.body.append(shell)
  let top = 400
  vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 844,
    width: 390, height: 844, toJSON: () => ({}),
  })
  vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: top, top, left: 0, right: 390, bottom: 844,
    width: 390, height: 844 - top, toJSON: () => ({}),
  }))

  let nextId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const scheduler: MobileSheetPresentationScheduler = {
    requestAnimationFrame: vi.fn((callback) => {
      const id = ++nextId
      frames.set(id, callback)
      return id
    }),
    cancelAnimationFrame: vi.fn((id) => { frames.delete(id) }),
  }
  const runFrame = (): void => {
    const [id, callback] = [...frames.entries()][0] ?? []
    if (id === undefined || !callback) throw new Error('No animation frame scheduled')
    frames.delete(id)
    callback(0)
  }
  const pointer = (name: 'pointerdown' | 'pointerup' | 'pointercancel'): void => {
    const event = new Event(name, { bubbles: true })
    sheet.dispatchEvent(event)
    if (name !== 'pointerdown') window.dispatchEvent(new Event(name))
  }
  const transition = (name: 'transitionrun' | 'transitionend' | 'transitioncancel'): void => {
    const event = new Event(name, { bubbles: true }) as TransitionEvent
    Object.defineProperties(event, { propertyName: { value: 'transform' } })
    sheet.dispatchEvent(event)
  }
  const setTop = (value: number): void => { top = value }

  return { shell, presentationTarget, sheet, frames, scheduler, runFrame, pointer, transition, setTop }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mobile sheet presentation tracking', () => {
  it('keeps rendered camera padding when a mutation precedes the transitionrun event', async () => {
    const { shell, sheet, scheduler, runFrame, transition, setTop } = setup()
    const changes = vi.fn()
    Object.defineProperty(sheet, 'getAnimations', { value: () => [
      { transitionProperty: 'transform', playState: 'running' },
    ] })
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler, shell, changes)
    sheet.setAttribute('data-detent', 'full')
    await Promise.resolve()
    runFrame()
    expect(changes.mock.calls.map(([bottom]) => bottom)).toEqual([456])
    setTop(180)
    runFrame()
    expect(changes).toHaveBeenLastCalledWith(676)
    setTop(0)
    transition('transitionend')
    expect(changes.mock.calls.map(([bottom]) => bottom)).toEqual([456, 676, 856, null])
    cleanup()
  })

  it('keeps frame work scoped to the map presentation target and skips unchanged values', () => {
    const { shell, presentationTarget, sheet, frames, scheduler, runFrame, pointer, setTop } = setup()
    const shellRead = vi.spyOn(shell, 'getBoundingClientRect')
    const sheetRead = vi.spyOn(sheet, 'getBoundingClientRect')
    const setPresentationStyle = vi.spyOn(presentationTarget.style, 'setProperty')
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler, presentationTarget)

    expect(shellRead).toHaveBeenCalledOnce()
    expect(sheetRead).toHaveBeenCalledOnce()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('')
    expect(presentationTarget.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('456px')

    pointer('pointerdown')
    runFrame()
    expect(sheetRead).toHaveBeenCalledTimes(2)
    expect(shellRead).toHaveBeenCalledOnce()
    expect(setPresentationStyle).toHaveBeenCalledOnce()
    expect(frames.size).toBe(1)

    setTop(250)
    runFrame()
    expect(sheetRead).toHaveBeenCalledTimes(3)
    expect(shellRead).toHaveBeenCalledOnce()
    expect(presentationTarget.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('606px')
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('')
    pointer('pointerup')
    cleanup()
  })

  it('defers a sheet style mutation measurement to the next animation frame', async () => {
    const { shell, sheet, scheduler, frames, runFrame } = setup()
    const sheetRead = vi.spyOn(sheet, 'getBoundingClientRect')
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)

    sheet.setAttribute('style', 'transform: translateY(10px)')
    await Promise.resolve()
    expect(sheetRead).toHaveBeenCalledOnce()
    expect(frames.size).toBe(1)

    runFrame()
    expect(sheetRead).toHaveBeenCalledTimes(2)
    runFrame()
    expect(frames.size).toBe(0)
    cleanup()
  })

  it('observes the sheet border box so swipe padding changes do not trigger size measurements', () => {
    const observe = vi.fn()
    class MockResizeObserver {
      readonly callback: ResizeObserverCallback
      observe = observe
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    const { shell, sheet, scheduler } = setup()

    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)

    expect(observe).toHaveBeenCalledWith(shell)
    expect(observe).toHaveBeenCalledWith(sheet, { box: 'border-box' })
    cleanup()
  })

  it('samples an instant detent change without transition events and returns to idle', async () => {
    const { shell, sheet, scheduler, frames, runFrame, setTop } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    setTop(0)
    sheet.setAttribute('data-detent', 'full')
    await Promise.resolve()
    runFrame()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('856px')
    expect(shell.classList.contains('map-sheet-occludes-crosshair')).toBe(true)
    runFrame()
    expect(frames.size).toBe(0)
    cleanup()
    setTop(400)
    sheet.setAttribute('data-detent', 'partial')
    await Promise.resolve()
    expect(frames.size).toBe(0)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('')
  })

  it('tracks sheet motion during a drag before the detent changes and stops when released', () => {
    const { shell, sheet, scheduler, frames, runFrame, pointer, setTop } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('456px')
    expect(frames.size).toBe(0)

    pointer('pointerdown')
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(false)
    setTop(250)
    runFrame()
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(true)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('606px')
    setTop(120)
    runFrame()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('736px')
    pointer('pointerup')
    runFrame()
    runFrame()
    expect(frames.size).toBe(0)
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(false)
    cleanup()
  })

  it('tracks settle transitions and samples the final position on transition end', () => {
    const { shell, sheet, scheduler, frames, runFrame, transition, setTop } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    transition('transitionrun')
    setTop(180)
    runFrame()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('676px')
    setTop(8)
    transition('transitionend')
    expect(shell.classList.contains('map-sheet-occludes-crosshair')).toBe(true)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('848px')
    runFrame()
    expect(frames.size).toBe(0)

    transition('transitionrun')
    setTop(350)
    transition('transitionend')
    expect(shell.classList.contains('map-sheet-occludes-crosshair')).toBe(false)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('506px')
    cleanup()
  })

  it('tracks a reversed drag toward collapsed and stops on pointer cancellation', () => {
    const { shell, sheet, scheduler, frames, runFrame, pointer, setTop } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    pointer('pointerdown')
    setTop(650)
    runFrame()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('206px')
    pointer('pointercancel')
    expect(frames.size).toBe(1)
    runFrame()
    runFrame()
    expect(frames.size).toBe(0)
    cleanup()
  })

  it('publishes measured drag and snap positions, then clears the transient inset at settle', () => {
    const { shell, sheet, scheduler, runFrame, pointer, transition, setTop } = setup()
    const changes: (number | null)[] = []
    const cleanup = observeMobileSheetPresentation(
      shell,
      sheet,
      scheduler,
      shell,
      (bottom) => changes.push(bottom),
    )

    pointer('pointerdown')
    runFrame()
    setTop(250)
    runFrame()
    pointer('pointerup')
    transition('transitionrun')
    setTop(180)
    runFrame()
    setTop(80)
    transition('transitionend')

    expect(changes).toEqual([456, 606, 676, 776, null])
    cleanup()
  })

  it('keeps tracking an interrupted transition while another transform transition is active', () => {
    const { shell, sheet, scheduler, frames, runFrame, transition, setTop } = setup()
    Object.defineProperty(sheet, 'getAnimations', { value: vi.fn().mockReturnValue([
      { transitionProperty: 'transform', playState: 'running' } as unknown as Animation,
    ]) })
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    transition('transitionrun')
    transition('transitioncancel')
    expect(frames.size).toBe(1)
    setTop(300)
    runFrame()
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('556px')
    cleanup()
  })

  it('removes listeners, scheduled frames, presentation variables, and occlusion state on cleanup', () => {
    const { shell, sheet, scheduler, frames, pointer, runFrame, setTop } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    pointer('pointerdown')
    setTop(250)
    runFrame()
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(true)
    expect(frames.size).toBe(1)
    cleanup()
    expect(frames.size).toBe(0)
    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(shell.style.getPropertyValue('--map-sheet-presentation-bottom-inset')).toBe('')
    expect(shell.classList.contains('map-sheet-occludes-crosshair')).toBe(false)
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(false)
    pointer('pointerup')
    expect(frames.size).toBe(0)
  })

  it('leaves direct stop-card presses animated when the sheet does not move', () => {
    const { shell, sheet, scheduler, pointer, runFrame } = setup()
    const cleanup = observeMobileSheetPresentation(shell, sheet, scheduler)
    pointer('pointerdown')
    runFrame()
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(false)
    pointer('pointerup')
    runFrame()
    expect(sheet.hasAttribute('data-content-motion-suppressed')).toBe(false)
    cleanup()
  })
})

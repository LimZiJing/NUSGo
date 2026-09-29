// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { animateMobileSheet } from './animate-mobile-sheet'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function createRect(height: number): DOMRect {
  return {
    x: 0,
    y: 844 - height,
    width: 320,
    height,
    top: 844 - height,
    right: 320,
    bottom: 844,
    left: 0,
    toJSON: () => undefined,
  }
}

function createSheet(detent: 'collapsed' | 'partial' | 'full') {
  const sheet = document.createElement('section')
  sheet.dataset.mobileSheet = ''
  sheet.dataset.detent = detent
  document.body.append(sheet)

  vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => {
    if (sheet.dataset.detent === 'collapsed') return createRect(0)
    if (sheet.style.height) return createRect(Number.parseFloat(sheet.style.height))
    return createRect(sheet.dataset.detent === 'full' ? 600 : 240)
  })
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ bottom: '64px' } as CSSStyleDeclaration)

  return sheet
}

function captureAnimationFrame() {
  let callback: FrameRequestCallback | null = null
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((next) => {
    callback = next
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

  return () => {
    if (!callback) throw new Error('Expected the sheet animation frame to be scheduled')
    callback(0)
  }
}

describe('animateMobileSheet', () => {
  it('animates from zero height when reopening a collapsed sheet', () => {
    const sheet = createSheet('partial')
    const runAnimationFrame = captureAnimationFrame()

    const cleanup = animateMobileSheet(sheet, 0, false, 64)

    expect(sheet.dataset.mobileSheetAnimating).toBe('true')
    expect(sheet.style.height).toBe('0px')
    runAnimationFrame()
    expect(sheet.style.height).toBe('240px')
    expect(sheet.style.transition).toBe('height 220ms ease-out, bottom 220ms ease-out')

    cleanup()
    expect(sheet.hasAttribute('data-mobile-sheet-animating')).toBe(false)
  })

  it('keeps a collapsed target measurable and animates it to zero height', () => {
    const sheet = createSheet('collapsed')
    const runAnimationFrame = captureAnimationFrame()

    const cleanup = animateMobileSheet(sheet, 600, false, 0)

    expect(sheet.dataset.mobileSheetAnimating).toBe('true')
    expect(sheet.style.height).toBe('600px')
    runAnimationFrame()
    expect(sheet.style.height).toBe('0px')

    cleanup()
    expect(sheet.hasAttribute('data-mobile-sheet-animating')).toBe(false)
  })
})

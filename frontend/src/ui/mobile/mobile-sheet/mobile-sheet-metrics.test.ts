// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureMobileSheetMetrics } from './mobile-sheet-metrics'

function createShell(
  bottom: number,
  tabBar: { top: number, height: number } | null,
  cssVariables: Record<string, string> = {},
): { shell: HTMLElement, tabBar: HTMLElement | null } {
  const shell = document.createElement('div')
  shell.getBoundingClientRect = () => ({ bottom }) as DOMRect
  for (const [name, value] of Object.entries(cssVariables)) shell.style.setProperty(name, value)
  const tabBarElement = tabBar ? document.createElement('nav') : null
  if (tabBarElement && tabBar) {
    tabBarElement.getBoundingClientRect = () => ({ top: tabBar.top, height: tabBar.height }) as DOMRect
  }
  return { shell, tabBar: tabBarElement }
}

describe('measureMobileSheetMetrics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports the visual viewport height, tab bar inset and collapsed handle height', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    const { shell, tabBar } = createShell(844, { top: 772, height: 56 }, {
      '--mobile-sheet-handle-row-height': '36px',
      '--mobile-sheet-handle-target-extension': '8px',
    })

    expect(measureMobileSheetMetrics(shell, tabBar)).toEqual({
      viewportHeight: 844,
      tabBarInset: 72,
      collapsedHeight: 44,
    })
  })

  it('prefers an explicit collapsed height and tolerates a missing tab bar', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700)
    const { shell } = createShell(700, null, { '--mobile-sheet-collapsed-height': '52px' })

    expect(measureMobileSheetMetrics(shell, null)).toEqual({
      viewportHeight: 700,
      tabBarInset: 0,
      collapsedHeight: 52,
    })
  })
})

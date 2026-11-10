import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'sheet.css'), 'utf8')
const lightTheme = readFileSync(resolve(stylesDirectory, '../../styles/shared/themes/light.css'), 'utf8')
const darkTheme = readFileSync(resolve(stylesDirectory, '../../styles/shared/themes/dark.css'), 'utf8')
const exploreStyles = readFileSync(resolve(stylesDirectory, '../../../features/explore/styles/explore-content.css'), 'utf8')
const stopsStyles = readFileSync(resolve(stylesDirectory, '../../../features/stops/styles/stops-content.css'), 'utf8')
const planStyles = readFileSync(resolve(stylesDirectory, '../../../features/plan/styles/plan-content.css'), 'utf8')
const morePanelStyles = readFileSync(resolve(stylesDirectory, '../../styles/shared/more-panel.css'), 'utf8')

function readRule(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replaceAll('.', '\\.')
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*{([^}]*)}`, 's'))

  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match[1]
}

function readRules(stylesheet: string, selector: string): string[] {
  const escapedSelector = selector.replaceAll('.', '\\.')

  return [...stylesheet.matchAll(new RegExp(`${escapedSelector}\\s*{([^}]*)}`, 'gs'))]
    .map(([, declarations]) => declarations)
}

describe('mobile sheet surfaces', () => {
  it('uses the shared page surface for workflow and settings sheets', () => {
    expect(readRule(styles, '.navigation-panel')).toMatch(/background:\s*var\(--surface\);/)

    for (const [stylesheet, selector] of [
      [exploreStyles, '.navigation-panel.explore-sheet'],
      [stopsStyles, '.navigation-panel.stops-sheet'],
      [planStyles, '.navigation-panel.plan-sheet'],
    ]) {
      const hasBackgroundOverride = readRules(stylesheet, selector)
        .some((declarations) => /background(?:-color)?\s*:/.test(declarations))

      expect(hasBackgroundOverride, selector).toBe(false)
    }

    expect(readRule(morePanelStyles, '.more-panel-surface')).toMatch(/background:\s*var\(--surface\);/)

    const fullSettingsRule = morePanelStyles.match(
      /\.mobile-sheet-popup\.more-panel-surface\[data-page='settings'\]\[data-detent='full'\][^{}]*\{([^}]*)\}/s,
    )

    expect(fullSettingsRule?.[1]).toMatch(/background:\s*var\(--surface\);/)
  })

  it('keeps sticky Plan wrappers blended with the sheet surface', () => {
    for (const selector of ['.plan-trip-pin', '.plan-search-header']) {
      const usesSheetSurface = readRules(planStyles, selector)
        .some((declarations) => /background:\s*var\(--surface\);/.test(declarations))

      expect(usesSheetSurface, selector).toBe(true)
    }
  })
})

describe('mobile sheet handle focus styles', () => {
  it('shows keyboard focus as a tint without an outline ring', () => {
    expect(styles).toMatch(/\.mobile-sheet-handle:focus-visible\s*{[^}]*outline:\s*none;[^}]*background:\s*var\(--surface-control\);/s)
  })

  it('darkens the grabber on keyboard focus only', () => {
    expect(styles).toMatch(/\.mobile-sheet-handle:focus-visible\s+\.mobile-sheet-grabber\s*{[^}]*background:\s*var\(--text-secondary\);/s)
    expect(styles).not.toMatch(/\.mobile-sheet-handle:(hover|active)[^{]*{[^}]*background/s)
  })

  it('uses theme tokens that exist in both light and dark themes', () => {
    for (const token of ['--surface-control', '--text-secondary']) {
      expect(lightTheme).toMatch(new RegExp(`^\\s*${token}\\s*:`, 'm'))
      expect(darkTheme).toMatch(new RegExp(`^\\s*${token}\\s*:`, 'm'))
    }
  })
})

describe('mobile sheet at the full detent', () => {
  it('stays clipped above the tab bar so the tab bar remains visible and tappable (#307)', () => {
    expect(styles).toMatch(/\.mobile-sheet-viewport\s*{[^}]*clip-path:\s*inset\(0 0 var\(--mobile-tab-bar-height\) 0\);/s)
    expect(styles).not.toMatch(/\.mobile-sheet-viewport\[data-detent='full'\]/)
  })

  it('keeps full-detent content above the tab bar like the other detents', () => {
    const fullPopup = styles.match(/\.navigation-panel\.mobile-sheet-popup\[data-detent='full'\]\s*{([^}]*)}/s)

    expect(fullPopup?.[1]).not.toMatch(/padding-bottom/)
  })
})

describe('mobile sheet movement', () => {
  it('transitions the popup transform without animating content padding', () => {
    const popup = styles.match(/\.navigation-panel\.mobile-sheet-popup\s*{([^}]*)}/s)?.[1] ?? ''

    expect(popup).toMatch(/transition:\s*transform\s+var\(--motion-duration-panel\)\s+var\(--motion-ease-standard\);/)
    expect(popup).not.toMatch(/padding-bottom\s+var\(--motion-duration-panel\)/)
    const padding = popup.match(/padding:\s*([^;]*);/s)?.[1] ?? ''
    expect(padding).toContain('--drawer-snap-point-offset')
    expect(padding).not.toContain('--drawer-swipe-movement-y')
    expect(popup).toMatch(/transform:\s*translateY\([^;]*var\(--drawer-swipe-movement-y, 0px\)/s)
  })
})

describe('Stops sheet release snap', () => {
  it('animates the sheet position without animating its scroll viewport padding', () => {
    const stopsPopup = styles.match(/\.mobile-sheet-popup\.stops-sheet\s*{([^}]*)}/s)?.[1] ?? ''

    expect(stopsPopup).toMatch(/transition:\s*transform\s+var\(--motion-duration-panel\)\s+var\(--motion-ease-standard\);/)
    expect(stopsPopup).not.toMatch(/padding-bottom/)
  })
})

describe('collapsed sheet summary', () => {
  it('truncates a long summary on one line instead of wrapping', () => {
    const summary = styles.match(/\.mobile-sheet-summary\s*{([^}]*)}/s)?.[1] ?? ''
    const detail = styles.match(/\.mobile-sheet-summary-detail\s*{([^}]*)}/s)?.[1] ?? ''

    expect(summary).toMatch(/white-space:\s*nowrap/)
    expect(detail).toMatch(/text-overflow:\s*ellipsis/)
    expect(detail).toMatch(/overflow:\s*hidden/)
  })
})

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'sheet.css'), 'utf8')
const lightTheme = readFileSync(resolve(stylesDirectory, '../../styles/shared/themes/light.css'), 'utf8')
const darkTheme = readFileSync(resolve(stylesDirectory, '../../styles/shared/themes/dark.css'), 'utf8')

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

describe('collapsed sheet summary', () => {
  it('truncates a long summary on one line instead of wrapping', () => {
    const summary = styles.match(/\.mobile-sheet-summary\s*{([^}]*)}/s)?.[1] ?? ''

    expect(summary).toMatch(/white-space:\s*nowrap/)
    expect(summary).toMatch(/text-overflow:\s*ellipsis/)
    expect(summary).toMatch(/overflow:\s*hidden/)
  })
})

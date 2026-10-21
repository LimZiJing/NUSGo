import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'plan-content.css'), 'utf8')

describe('mobile Plan panel scrolling styles', () => {
  it('keeps the panel vertically scrollable and fits the trip card in its scrollport', () => {
    expect(styles).toMatch(
      /\.navigation-panel\s+\.plan-content-panel\s*{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*auto;/s,
    )
    expect(styles).toMatch(
      /\.plan-trip-card,\s*\.plan-location-search\s*{[^}]*width:\s*calc\(100%\s*-\s*var\(--space-3\)\);[^}]*margin-inline:\s*var\(--space-3\)\s+0;/s,
    )
    expect(styles).toMatch(
      /\.navigation-panel\s+\.plan-content-panel\s+\.journey-results\s*{[^}]*width:\s*calc\(100%\s*-\s*var\(--space-3\)\);[^}]*margin-inline-start:\s*var\(--space-3\);[^}]*box-sizing:\s*border-box;/s,
    )
  })
})

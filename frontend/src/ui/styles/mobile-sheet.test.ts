import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'mobile-sheet.css'), 'utf8')

describe('mobile sheet scrolling styles', () => {
  it('keeps every mobile sheet scroll container inside the content gutter', () => {
    expect(styles).toMatch(/\.mobile-sheet\s+\.mobile-sheet-scroll-content\s*{[^}]*box-sizing:\s*border-box;/s)
    expect(styles).toMatch(/\.mobile-sheet\s+\.mobile-sheet-scroll-content\s*{[^}]*margin-inline-end:\s*var\(--space-1\);/s)
    expect(styles).toMatch(/\.mobile-sheet\s+\.mobile-sheet-scroll-content\s*{[^}]*overflow-y:\s*auto;/s)
    expect(styles).toMatch(/\.mobile-sheet\s+\.mobile-sheet-scroll-content\s*{[^}]*padding-inline-end:\s*var\(--space-2\);/s)
    expect(styles).toMatch(/\.mobile-sheet\s+\.mobile-sheet-scroll-content\s*{[^}]*scrollbar-gutter:\s*stable;/s)
  })
})

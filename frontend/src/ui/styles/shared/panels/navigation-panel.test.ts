import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'navigation-panel.css'), 'utf8')

describe('navigation panel scrolling styles', () => {
  it('keeps every panel scroll container inside the content gutter', () => {
    expect(styles).toMatch(/\.navigation-panel\s+\.navigation-panel-scroll-content\s*{[^}]*box-sizing:\s*border-box;/s)
    expect(styles).toMatch(/\.navigation-panel\s+\.navigation-panel-scroll-content\s*{[^}]*margin-inline-end:\s*var\(--space-1\);/s)
    expect(styles).toMatch(/\.navigation-panel\s+\.navigation-panel-scroll-content\s*{[^}]*overflow-y:\s*auto;/s)
    expect(styles).toMatch(/\.navigation-panel\s+\.navigation-panel-scroll-content\s*{[^}]*padding-inline-end:\s*var\(--space-2\);/s)
    expect(styles).toMatch(/\.navigation-panel\s+\.navigation-panel-scroll-content\s*{[^}]*scrollbar-gutter:\s*stable;/s)
  })
})

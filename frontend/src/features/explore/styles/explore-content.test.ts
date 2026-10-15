import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'explore-content.css'), 'utf8')

describe('Explore search styles', () => {
  it('keeps placeholder text clear of the search icon at every viewport size', () => {
    expect(styles).toMatch(/\.explore-content-search-row input\s*{[^}]*padding:\s*8px 46px 8px 40px;/s)
    expect(styles).toMatch(/\.explore-content-search-row input\s*{[^}]*padding:\s*10px 54px 10px 40px;/s)
  })

  it('uses the mobile venue result card treatment at every viewport size', () => {
    expect(styles).toMatch(/\.explore-content \.explore-content-result\s*{[^}]*min-height:\s*3\.5rem;[^}]*padding:\s*10px 12px;[^}]*border-radius:\s*var\(--radius-lg\);[^}]*background:\s*var\(--surface-raised\);/s)
  })

  it('lets the shared venue results area fill and scroll its available height', () => {
    expect(styles).toMatch(/\.explore-content \.explore-content-results\s*{[^}]*min-height:\s*0;[^}]*max-height:\s*none;/s)
    expect(styles).toMatch(/\.explore-content \.explore-content-results\s*{[^}]*max-height:\s*28dvh;/s)
  })
})

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'explore-view.css'), 'utf8')

describe('Explore search styles', () => {
  it('keeps placeholder text clear of the search icon at every viewport size', () => {
    expect(styles).toMatch(/\.explore-view-search-row input\s*{[^}]*padding:\s*8px 46px 8px 40px;/s)
    expect(styles).toMatch(/\.explore-view-search-row input\s*{[^}]*padding:\s*10px 54px 10px 40px;/s)
  })
})

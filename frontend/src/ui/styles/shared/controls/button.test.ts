import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'button.css'), 'utf8')

describe('icon button styles', () => {
  it('keeps the full touch target inside a crowded flex row', () => {
    expect(styles).toMatch(/\.button\.icon-button\s*{[^}]*flex-shrink:\s*0;[^}]*width:\s*var\(--control-height-sm\);/s)
  })
})

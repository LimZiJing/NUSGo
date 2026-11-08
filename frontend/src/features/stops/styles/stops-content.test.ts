import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'stops-content.css'), 'utf8')

describe('stop row styles', () => {
  it('keeps collapsed and expanded stop rows on their main-branch surface', () => {
    expect(styles).toMatch(/\.button\.stop-card-toggle\s*{[^}]*border:\s*0;[^}]*color:\s*var\(--text-strong\);[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.button\.stop-card-toggle\[aria-expanded='true'\]\s*{[^}]*border:\s*0;[^}]*color:\s*var\(--text-strong\);[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.button\.stop-card-toggle\[aria-expanded='true'\]:not\(\[data-variant='plain'\]\)\s+svg\s*{[^}]*color:\s*var\(--text-strong\);/s)
  })
})

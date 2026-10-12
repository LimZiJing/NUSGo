import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mapStyles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'map.css'), 'utf8')

describe('location control searching styles', () => {
  it('animates only the spinner and stops it under reduced motion', () => {
    expect(mapStyles).toMatch(/\.location-control-spinner\s*\{[^}]*animation:\s*location-control-spin/)
    expect(mapStyles).not.toMatch(/\.location-control-chip-searching\s*\{[^}]*animation:/)

    const reducedMotion = mapStyles.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.location-control-spinner\s*\{([^}]*)\}/)
    expect(reducedMotion?.[1]).toMatch(/animation:\s*none/)
  })
})

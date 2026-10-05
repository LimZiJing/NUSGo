import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'route-chip.css'), 'utf8')

describe('shuttle route scrolling styles', () => {
  it('hides the native scrollbar while preserving smooth native scrolling', () => {
    expect(styles).toMatch(/\.route-chip-list\s*{[^}]*scroll-behavior:\s*smooth;/s)
    expect(styles).toMatch(/\.route-chip-list\s*{[^}]*scrollbar-width:\s*none;/s)
    expect(styles).toMatch(/\.route-chip-list::-webkit-scrollbar\s*{[^}]*display:\s*none;/s)
    expect(styles).toMatch(/\.route-chip-list\s*{[^}]*-webkit-overflow-scrolling:\s*touch;/s)
    expect(styles).toMatch(/\.route-chip-list\s*{[^}]*scroll-padding-inline-start:\s*2px;/s)
  })

  it('keeps arrow indicators visually unstyled and fully hidden at an endpoint', () => {
    expect(styles).toMatch(/\.explore-view \.route-scroll-arrow,[\s\S]*?\.stops-view \.route-scroll-arrow\s*{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
    expect(styles).toMatch(/\.route-scroll-arrow\[hidden\]\s*{[^}]*display:\s*none;/s)
  })
})

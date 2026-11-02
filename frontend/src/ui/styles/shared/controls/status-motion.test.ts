import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const statusDotStyles = readFileSync(resolve(directory, 'status-dot.css'), 'utf8')
const pillStyles = readFileSync(resolve(directory, 'pill.css'), 'utf8')

function reducedMotionBlock(css: string): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)')
  expect(start).toBeGreaterThan(-1)
  return css.slice(start)
}

describe('refreshing cue under reduced motion', () => {
  it('replaces the status dot pulse with a ring on the green dot', () => {
    const block = reducedMotionBlock(statusDotStyles)

    expect(block).toMatch(/\[data-pulse='true'\]\s*\{[^}]*animation:\s*none/)
    expect(block).toMatch(/\[data-tone='success'\]\s*\{[^}]*outline:\s*1\.5px solid var\(--status-success\)/)
  })

  it('replaces the pill dot pulse with a ring', () => {
    const block = reducedMotionBlock(pillStyles)

    expect(block).toMatch(/animation:\s*none/)
    expect(block).toMatch(/outline:\s*1px solid currentColor/)
  })
})

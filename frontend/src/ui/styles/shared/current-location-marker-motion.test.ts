import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mapStyles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'map.css'), 'utf8')

describe('current-location marker motion styles', () => {
  it('shows a one-shot pulse after recentering and respects reduced motion', () => {
    expect(mapStyles).toMatch(/\.current-location-marker-pulsing::after\s*\{\s*animation:\s*current-location-marker-pulse/)

    const reducedMotionPulse = mapStyles.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.current-location-marker-pulsing::after\s*\{([^}]*)\}/)
    expect(reducedMotionPulse?.[1]).toMatch(/animation:\s*none/)
  })
})

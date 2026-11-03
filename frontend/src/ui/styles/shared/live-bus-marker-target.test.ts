import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./map.css', import.meta.url), 'utf8')

describe('live bus marker hit area', () => {
  it('meets the 36px minimum in both dimensions independently of the vehicle artwork', () => {
    const markerRule = styles.match(/\.live-bus-marker\s*\{([^}]*)\}/)?.[1]
    for (const dimension of ['width', 'height']) {
      const pixels = markerRule?.match(new RegExp(`\\b${dimension}:\\s*(\\d+)px`))?.[1]
      expect(Number(pixels), dimension).toBeGreaterThanOrEqual(36)
    }
  })
})

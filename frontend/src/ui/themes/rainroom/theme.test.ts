import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const themeStyles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

function readColour(styles: string, name: string, seen: readonly string[] = []): string {
  if (seen.includes(name)) throw new Error(`Circular theme token: ${name}`)

  const match = styles.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`Missing theme token: ${name}`)

  const value = match[1].trim()
  const reference = value.match(/^var\((--[\w-]+)\)$/)
  return reference ? readColour(styles, reference[1], [...seen, name]) : value
}

function relativeLuminance(value: string): number {
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) throw new Error(`Expected a hex colour, received: ${value}`)

  const hex = match[1].length === 3
    ? [...match[1]].map((part) => `${part}${part}`).join('')
    : match[1]
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)

  return linear.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Rainroom theme', () => {
  it('loads its stylesheet through the theme entry point', () => {
    const entry = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(entry).toContain("import './index.css'")
  })

  it('uses the shared page surface for navigation panels', () => {
    const panelRule = themeStyles.match(
      /:root\[data-theme='rainroom'\] \.navigation-column,[^{}]*\{([^}]*)\}/,
    )

    expect(panelRule?.[1]).toMatch(/background-color:\s*var\(--surface\);/)
  })

  it('shares the selected segmented-control highlight between Explore and Stops', () => {
    const selectedRule = themeStyles.match(
      /:root\[data-theme='rainroom'\] \.explore-mode-selector \.segmented-control-option\[aria-pressed='true'\]::before,\s*:root\[data-theme='rainroom'\] \.stops-list-selector \.segmented-control-option\[aria-pressed='true'\]::before\s*\{([^}]*)\}/,
    )

    expect(selectedRule?.[1]).toMatch(/background:\s*linear-gradient/)
    expect(selectedRule?.[1]).toContain('var(--shadow-soft)')
  })

  it('keeps theme text and status pairs readable', () => {
    const pairs = [
      ['--text-primary', '--surface'],
      ['--text-secondary', '--surface'],
      ['--text-muted', '--surface'],
      ['--accent-contrast', '--accent'],
      ['--text-inverse', '--status-error-strong'],
      ['--status-success', '--status-success-surface'],
      ['--status-warning', '--status-warning-surface'],
      ['--status-error', '--status-error-surface'],
      ['--status-info', '--status-info-surface'],
    ] as const

    for (const [foregroundToken, backgroundToken] of pairs) {
      const foreground = readColour(themeStyles, foregroundToken)
      const background = readColour(themeStyles, backgroundToken)
      expect(contrastRatio(foreground, background), `${foregroundToken} on ${backgroundToken}`)
        .toBeGreaterThanOrEqual(4.5)
    }
  })
})

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))

function readStyleFile(name: string): string {
  return readFileSync(resolve(stylesDirectory, name), 'utf8')
}

function readCustomPropertyNames(styles: string): string[] {
  return [...styles.matchAll(/^\s*(--[\w-]+)\s*:/gm)]
    .map(([, name]) => name)
    .sort()
}

function readCustomPropertyValue(styles: string, name: string): string {
  const match = styles.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))

  if (!match) {
    throw new Error(`Missing theme token: ${name}`)
  }

  return match[1].trim()
}

function parseHexColor(value: string): [number, number, number] {
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)

  if (!match) {
    throw new Error(`Expected a hex color, received: ${value}`)
  }

  const hex = match[1].length === 3
    ? [...match[1]].map((part) => `${part}${part}`).join('')
    : match[1]

  return [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255) as [number, number, number]
}

function toHexColor(channels: readonly number[]): string {
  return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
}

/* Resolves simple token references and `color-mix(in srgb, var(--a) N%, var(--b))` values used
   by the themes. Mixing happens in sRGB, matching the CSS the browser evaluates. */
function resolveColour(styles: string, token: string): string {
  const value = readCustomPropertyValue(styles, token)
  const reference = value.match(/^var\((--[\w-]+)\)$/)

  if (reference) {
    return resolveColour(styles, reference[1])
  }

  const mix = value.match(/^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*var\((--[\w-]+)\)\)$/)

  if (!mix) {
    return value
  }

  const [, foregroundToken, percentage, backgroundToken] = mix
  const weight = Number(percentage) / 100
  const foreground = parseHexColor(resolveColour(styles, foregroundToken))
  const background = parseHexColor(resolveColour(styles, backgroundToken))

  return toHexColor(foreground.map((channel, index) => channel * weight + background[index] * (1 - weight)))
}

function relativeLuminance(value: string): number {
  return parseHexColor(value)
    .map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

describe('semantic theme tokens', () => {
  it('defines the same tokens for light and dark themes', () => {
    const lightTokens = readCustomPropertyNames(readStyleFile('themes/light.css'))
    const darkTokens = readCustomPropertyNames(readStyleFile('themes/dark.css'))

    expect(darkTokens).toEqual(lightTokens)
  })

  it('includes the shared token groups needed by UI components', () => {
    const lightTokens = readCustomPropertyNames(readStyleFile('themes/light.css'))

    expect(lightTokens).toEqual(expect.arrayContaining([
      '--surface',
      '--text-primary',
      '--border-default',
      '--accent',
      '--status-success',
      '--status-warning',
      '--status-error',
      '--load-level-low',
      '--load-level-medium',
      '--load-level-high',
      '--load-level-unknown',
      '--focus-ring',
      '--shadow-sm',
    ]))
  })

  it('loads every theme from the shared style entrypoint', () => {
    const indexStyles = readStyleFile('index.css')

    expect(indexStyles).toContain('@import \'./themes/light.css\';')
    expect(indexStyles).toContain('@import \'./themes/dark.css\';')
    expect(indexStyles).toContain('@import \'./themes/matcha.css\';')
    expect(indexStyles).toContain('@import \'./themes/sakura.css\';')
    expect(indexStyles).toContain('@import \'./themes/nus.css\';')
  })

  it.each([
    ['light', 'themes/light.css'],
    ['dark', 'themes/dark.css'],
    ['matcha', 'themes/matcha.css'],
    ['sakura', 'themes/sakura.css'],
    ['nus', 'themes/nus.css'],
  ])('keeps key theme text pairs readable in the %s theme', (_themeName, fileName) => {
    const styles = readStyleFile(fileName)
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
      const ratio = contrastRatio(resolveColour(styles, foregroundToken), resolveColour(styles, backgroundToken))

      expect(ratio, `${foregroundToken} on ${backgroundToken}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('control token contrast', () => {
  const themes = ['light', 'dark', 'matcha', 'sakura', 'nus'] as const

  it.each(themes)('keeps the soft tonal control colours accessible in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const ratioOf = (foreground: string, background: string) => contrastRatio(
      resolveColour(styles, foreground),
      resolveColour(styles, background),
    )

    const checks = [
      // Non-text boundary of secondary controls and chips (WCAG 1.4.11).
      ['--control-border', '--surface', 3],
      // Secondary label and unselected chip label on the neutral control fill.
      ['--text-primary', '--surface-control', 4.5],
      // Primary button and selected chip label on the accent fill.
      ['--text-inverse', '--accent', 4.5],
      // Primary fill boundary against the page surface.
      ['--accent', '--surface', 3],
      // Ghost button label on the page surface.
      ['--accent', '--surface', 4.5],
    ] as const

    for (const [foreground, background, minimum] of checks) {
      expect(ratioOf(foreground, background), `${themeName}: ${foreground} on ${background}`)
        .toBeGreaterThanOrEqual(minimum)
    }
  })

  it.each(themes)('defines accessible hover and selected control colours in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const tokens = readCustomPropertyNames(styles)

    expect(tokens).toEqual(expect.arrayContaining(['--accent-selected', '--surface-control-hover']))
    expect(readCustomPropertyValue(styles, '--accent-selected'))
      .toBe('color-mix(in srgb, var(--accent) 26%, var(--surface-control))')
    expect(readCustomPropertyValue(styles, '--surface-control-hover'))
      .toBe('color-mix(in srgb, var(--text-primary) 11%, var(--surface-control))')

    const ratioOf = (foreground: string, background: string) => contrastRatio(
      resolveColour(styles, foreground),
      resolveColour(styles, background),
    )

    expect(ratioOf('--text-primary', '--accent-selected')).toBeGreaterThanOrEqual(4.5)
    expect(ratioOf('--accent-hover', '--accent-selected')).toBeGreaterThanOrEqual(3)
    expect(ratioOf('--text-primary', '--surface-control-hover')).toBeGreaterThanOrEqual(4.5)
    expect(ratioOf('--accent-selected', '--surface-control')).toBeGreaterThanOrEqual(1.25)
    expect(ratioOf('--surface-control-hover', '--surface-control')).toBeGreaterThanOrEqual(1.1)
  })

  it('uses semantic control colors instead of brightness filters', () => {
    for (const file of ['base.css', 'controls/button.css', 'controls/chip.css', 'map.css']) {
      expect(readStyleFile(file), file).not.toMatch(/brightness\s*\(/)
    }
  })

  it('keeps selected map overlay controls above their base icon-button styles', () => {
    const styles = readStyleFile('map.css')

    expect(styles).toContain(".button.icon-button.map-overlay-button[aria-pressed='true']")
    expect(styles).toContain(".button.icon-button.map-overlay-button[aria-expanded='true']")
    expect(styles).toContain('background: var(--accent-selected)')
  })

  it.each(themes)('defines --control-border in the %s theme', (themeName) => {
    expect(readCustomPropertyNames(readStyleFile(`themes/${themeName}.css`))).toContain('--control-border')
  })

  it.each(themes)('keeps load-level colours readable on arrival surfaces in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const loadLevelTokens = [
      '--load-level-low',
      '--load-level-medium',
      '--load-level-high',
      '--load-level-unknown',
    ] as const
    const arrivalSurfaces = ['--surface', '--surface-raised', '--surface-card'] as const

    for (const foreground of loadLevelTokens) {
      for (const background of arrivalSurfaces) {
        const ratio = contrastRatio(resolveColour(styles, foreground), resolveColour(styles, background))

        expect(ratio, `${themeName}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it.each(themes)('keeps favourite icons distinguishable in the %s theme', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)

    for (const background of ['--surface', '--surface-raised', '--accent-soft'] as const) {
      const ratio = contrastRatio(resolveColour(styles, '--text-favorite'), resolveColour(styles, background))

      expect(ratio, `${themeName}: --text-favorite on ${background}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(themes)('keeps strong success text readable on the %s theme surface', (themeName) => {
    const styles = readStyleFile(`themes/${themeName}.css`)
    const ratio = contrastRatio(
      resolveColour(styles, '--text-success-strong'),
      resolveColour(styles, '--surface'),
    )

    expect(ratio, `${themeName}: --text-success-strong on --surface`).toBeGreaterThanOrEqual(4.5)
  })
})

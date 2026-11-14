import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_LAYOUT_MEDIA_QUERY,
  MOBILE_LAYOUT_MEDIA_QUERY,
  isMobileLayout,
} from './layout-breakpoint'

const frontendSourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const LAYOUT_FEATURES = new Set([
  'width <= 768px',
  'width > 768px',
  'width <= 640px',
  'width > 640px',
])

// Component-level breakpoints that are deliberately not the mobile/desktop layout breakpoint.
const OTHER_BREAKPOINTS = new Set([
  'max-width: 480px', // Component-level breakpoint in plan-content.css.
  'max-width: 1024px', // Component-level breakpoint in shared/base.css and shared/tokens.css.
])

const MEDIA_RULE_PATTERN = /@media\s+([^{]+)\{/g
const WIDTH_FEATURE_PATTERN = /\((?:(min|max)-width:\s*([^)]+?)|width\s*(<=|<|>=|>)\s*([^)]+?))\)/g

function collectCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectCssFiles(path)
    }
    return entry.isFile() && entry.name.endsWith('.css') ? [path] : []
  })
}

function scanMediaQueries(css: string): { query: string; widthFeatures: string[] }[] {
  return [...css.matchAll(MEDIA_RULE_PATTERN)].map((rule) => {
    const prelude = rule[1].trim()
    return {
      query: '@media ' + prelude,
      widthFeatures: [...prelude.matchAll(WIDTH_FEATURE_PATTERN)].map((feature) => (
        feature[1]
          ? feature[1] + '-width: ' + feature[2]
          : 'width ' + feature[3] + ' ' + feature[4]
      )),
    }
  })
}

function findUnexpectedWidthQueries(file: string, css: string): string[] {
  return scanMediaQueries(css).flatMap(({ query, widthFeatures }) =>
    widthFeatures
      .filter((feature) => !LAYOUT_FEATURES.has(feature) && !OTHER_BREAKPOINTS.has(feature))
      .map((feature) => `${file}: "${query}" uses unexpected width feature "(${feature})"`),
  )
}

const cssFiles = collectCssFiles(frontendSourceDirectory).map((path) => ({
  file: relative(frontendSourceDirectory, path),
  css: readFileSync(path, 'utf8'),
}))

const allWidthFeatures = cssFiles.flatMap(({ css }) =>
  scanMediaQueries(css).flatMap(({ widthFeatures }) => widthFeatures),
)

describe('layout breakpoint', () => {
  it('classifies fractional viewport dimensions without a dead zone', () => {
    const cases: Array<[number, number, boolean]> = [
      [640, 420, true],
      [640.5, 420, false],
      [640.5, 420.5, true],
      [768, 420, false],
      [768, 420.5, true],
      [768.5, 420, false],
      [768.5, 420.5, false],
    ]

    for (const [width, height, expectedMobile] of cases) {
      expect(isMobileLayout(width, height)).toBe(expectedMobile)
    }
  })

  it('exposes matching mobile and desktop media queries for the shared layout mode', () => {
    expect(MOBILE_LAYOUT_MEDIA_QUERY).toBe(
      '(width <= 640px), (width <= 768px) and (height > 420px)',
    )
    expect(DESKTOP_LAYOUT_MEDIA_QUERY).toBe(
      '(width > 768px), (width > 640px) and (height <= 420px)',
    )
  })

  it('uses the same complete layout query in each mobile and desktop stylesheet', () => {
    const mediaQueries = cssFiles.flatMap(({ file, css }) => (
      scanMediaQueries(css).map(({ query }) => ({ file, query }))
    ))
    const mobileRules = mediaQueries.filter(({ query }) => query.includes('width <= 768px'))
    const desktopRules = mediaQueries.filter(({ query }) => query.includes('width > 768px'))

    expect(mobileRules.length).toBeGreaterThan(0)
    expect(mobileRules.every(({ query }) => query === `@media ${MOBILE_LAYOUT_MEDIA_QUERY}`)).toBe(true)
    expect(desktopRules.length).toBeGreaterThan(0)
    expect(desktopRules.every(({ query }) => query === `@media ${DESKTOP_LAYOUT_MEDIA_QUERY}`)).toBe(true)
  })

  it('keeps every CSS width media query on the layout breakpoint or a listed component breakpoint', () => {
    const violations = cssFiles.flatMap(({ file, css }) => findUnexpectedWidthQueries(file, css))
    expect(violations).toEqual([])
  })

  it('finds CSS media queries for both layout features so the scan cannot pass silently', () => {
    expect(cssFiles.length).toBeGreaterThan(0)
    expect(allWidthFeatures).toContain('width <= 768px')
    expect(allWidthFeatures).toContain('width > 768px')
  })
})

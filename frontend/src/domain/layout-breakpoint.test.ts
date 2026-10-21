import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_LAYOUT_MIN_WIDTH,
  MOBILE_LAYOUT_MAX_WIDTH,
  MOBILE_LAYOUT_MEDIA_QUERY,
  isMobileLayoutWidth,
} from './layout-breakpoint'

const frontendSourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const LAYOUT_FEATURES = new Set([
  `max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px`,
  `min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px`,
])

// Component-level breakpoints that are deliberately not the mobile/desktop layout breakpoint.
const OTHER_BREAKPOINTS = new Set([
  'max-width: 480px', // Component-level breakpoint in plan-content.css.
  'max-width: 1024px', // Component-level breakpoint in shared/base.css and shared/tokens.css.
])

const MEDIA_RULE_PATTERN = /@media\s+([^{]+)\{/g
const WIDTH_FEATURE_PATTERN = /\((min|max)-width:\s*([^)]+?)\s*\)/g

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
      query: `@media ${prelude}`,
      widthFeatures: [...prelude.matchAll(WIDTH_FEATURE_PATTERN)].map(
        (feature) => `${feature[1]}-width: ${feature[2]}`,
      ),
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
  it('treats 768px as mobile and 769px as desktop', () => {
    expect(isMobileLayoutWidth(768)).toBe(true)
    expect(isMobileLayoutWidth(769)).toBe(false)
  })

  it('exposes the mobile media query for the shared breakpoint', () => {
    expect(MOBILE_LAYOUT_MEDIA_QUERY).toBe('(max-width: 768px)')
  })

  it('keeps every CSS width media query on the layout breakpoint or a listed component breakpoint', () => {
    const violations = cssFiles.flatMap(({ file, css }) => findUnexpectedWidthQueries(file, css))
    expect(violations).toEqual([])
  })

  it('finds CSS media queries for both layout features so the scan cannot pass silently', () => {
    expect(cssFiles.length).toBeGreaterThan(0)
    expect(allWidthFeatures).toContain(`max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px`)
    expect(allWidthFeatures).toContain(`min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px`)
  })
})

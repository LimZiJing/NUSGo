// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocationControl } from '../../location-control'
import { SettingsEntryButton } from '../../settings-entry-button'

afterEach(cleanup)

const mapStyles = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'map.css'), 'utf8')

describe('map control surface', () => {
  it('applies the shared surface class to Locate and Settings', () => {
    render(
      <div className="map-control-stack">
        <LocationControl topOffset={76} searching={false} onLocate={() => {}} />
        <SettingsEntryButton expanded={false} onClick={() => {}} />
      </div>,
    )

    expect(screen.getByRole('button', { name: 'Show my location' }).classList.contains('map-control-surface')).toBe(true)
    expect(screen.getByRole('button', { name: 'Settings' }).classList.contains('map-control-surface')).toBe(true)
  })

  it('uses a stack-scoped selector for the shared overlay surface', () => {
    const sharedSurface = mapStyles.match(/\.map-control-stack\s+\.map-control-surface\s*\{([^}]*)\}/s)?.[1]

    expect(sharedSurface).toMatch(/background:\s*var\(--surface-overlay\)/)
    expect(sharedSurface).toMatch(/backdrop-filter:\s*var\(--blur-overlay\)/)
    expect(sharedSurface).toMatch(/box-shadow:\s*var\(--glass-edge\),\s*var\(--shadow-md\)/)
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsContent } from './settings-content'

afterEach(cleanup)

describe('Settings sections', () => {
  it('opens independently and starts with Appearance expanded', async () => {
    const user = userEvent.setup()
    render(
      <SettingsContent
        themePreference="system"
        onThemePreferenceChange={() => undefined}
        favoriteStops={[]}
        onRemoveFavorite={() => undefined}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
      />,
    )

    const getSection = (title: string): HTMLDetailsElement => {
      const summary = screen.getByText(title)
      const details = summary.closest('details')
      if (!(details instanceof HTMLDetailsElement)) throw new Error(`${title} section is missing`)
      return details
    }

    const appearance = getSection('Appearance')
    const favourites = getSection('Favourites')
    const about = getSection('About')

    expect(screen.getByRole('contentinfo', { name: 'Map data attribution' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'OpenMapTiles' }).getAttribute('href'))
      .toBe('https://openmaptiles.org/')

    expect(appearance.open).toBe(true)
    expect(favourites.open).toBe(false)
    expect(about.open).toBe(false)

    await user.click(screen.getByText('Favourites'))
    await user.click(screen.getByText('About'))
    expect(favourites.open).toBe(true)
    expect(about.open).toBe(true)

    await user.click(screen.getByText('Appearance'))
    expect(appearance.open).toBe(false)
    expect(favourites.open).toBe(true)
    expect(about.open).toBe(true)
  })
})

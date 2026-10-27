// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsContent } from './settings-content'

afterEach(cleanup)

describe('Settings sections', () => {
  it('opens sections independently and starts Favourites expanded only when saved stops exist', async () => {
    const user = userEvent.setup()
    render(
      <SettingsContent
        themePreference="system"
        onThemePreferenceChange={() => undefined}
        favoriteStops={[{ id: 'kent-ridge', name: 'Kent Ridge Bus Terminal' }]}
        onMoveFavorite={() => undefined}
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

    expect(appearance.open).toBe(false)
    expect(favourites.open).toBe(true)
    expect(about.open).toBe(false)

    await user.click(screen.getByText('Appearance'))
    await user.click(screen.getByText('About'))
    expect(appearance.open).toBe(true)
    expect(favourites.open).toBe(true)
    expect(about.open).toBe(true)

    await user.click(screen.getByText('Favourites'))
    expect(appearance.open).toBe(true)
    expect(favourites.open).toBe(false)
    expect(about.open).toBe(true)
  })

  it('manages favourites in Settings and keeps the saved order in the summary', async () => {
    const user = userEvent.setup()
    const onRemoveFavorite = vi.fn()
    const view = render(
      <SettingsContent
        themePreference="matcha"
        onThemePreferenceChange={() => undefined}
        favoriteStops={[{ id: 'kent-ridge', name: 'Kent Ridge Bus Terminal' }]}
        onMoveFavorite={() => undefined}
        onRemoveFavorite={onRemoveFavorite}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
      />,
    )

    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit list' }))
    await user.click(screen.getByRole('button', { name: 'Remove Kent Ridge Bus Terminal from favourites' }))

    expect(onRemoveFavorite).toHaveBeenCalledWith('kent-ridge')
    view.rerender(
      <SettingsContent
        themePreference="matcha"
        onThemePreferenceChange={() => undefined}
        favoriteStops={[]}
        onMoveFavorite={() => undefined}
        onRemoveFavorite={onRemoveFavorite}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Manage in Stops' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.getByText('Matcha palette')).toBeTruthy()
  })
})

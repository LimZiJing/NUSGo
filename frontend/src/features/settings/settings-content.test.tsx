// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsContent } from './settings-content'

afterEach(cleanup)

describe('Settings sections', () => {
  it('starts all sections collapsed and opens them independently when saved stops exist', async () => {
    const user = userEvent.setup()
    render(
      <SettingsContent
        communityWaypointDownloadUrl="/data/community-waypoints.geojson"
        themePreference="system"
        onThemePreferenceChange={() => undefined}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
        favoriteStops={[{ id: 'kent-ridge', name: 'Kent Ridge Bus Terminal' }]}
        onMoveFavorite={() => undefined}
        onRemoveFavorite={() => undefined}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
      />,
    )

    expect(document.querySelectorAll('.settings-disclosure-icon.menu-icon-tile')).toHaveLength(4)

    const getSection = (title: string): HTMLDetailsElement => {
      const summary = screen.getByText(title)
      const details = summary.closest('details')
      if (!(details instanceof HTMLDetailsElement)) throw new Error(`${title} section is missing`)
      return details
    }

    const appearance = getSection('Appearance')
    const favourites = getSection('Favourites')
    const about = getSection('About')
    const waypoints = getSection('Waypoints')

    expect(appearance.open).toBe(false)
    expect(favourites.open).toBe(false)
    expect(about.open).toBe(false)
    expect(waypoints.open).toBe(false)

    await user.click(screen.getByText('Appearance'))
    await user.click(screen.getByText('About'))
    await user.click(screen.getByText('Waypoints'))
    expect(appearance.open).toBe(true)
    expect(favourites.open).toBe(false)
    expect(about.open).toBe(true)
    expect(waypoints.open).toBe(true)
    expect(screen.getByRole('link', { name: 'Download approved community waypoints' }).getAttribute('href'))
      .toBe('/data/community-waypoints.geojson')

    await user.click(screen.getByText('Favourites'))
    expect(appearance.open).toBe(true)
    expect(favourites.open).toBe(true)
    expect(about.open).toBe(true)
    expect(waypoints.open).toBe(true)
  })

  it('manages favourites in Settings and keeps the saved order in the summary', async () => {
    const user = userEvent.setup()
    const onRemoveFavorite = vi.fn()
    const view = render(
      <SettingsContent
        communityWaypointDownloadUrl="/data/community-waypoints.geojson"
        themePreference="matcha"
        onThemePreferenceChange={() => undefined}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
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
        communityWaypointDownloadUrl="/data/community-waypoints.geojson"
        themePreference="matcha"
        onThemePreferenceChange={() => undefined}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
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

  it('offers accessible minute format choices and reports a change', async () => {
    const user = userEvent.setup()
    const onMinuteFormatChange = vi.fn()
    render(
      <SettingsContent
        communityWaypointDownloadUrl="/data/community-waypoints.geojson"
        themePreference="system"
        onThemePreferenceChange={() => undefined}
        minuteFormat="prime"
        onMinuteFormatChange={onMinuteFormatChange}
        favoriteStops={[]}
        onMoveFavorite={() => undefined}
        onRemoveFavorite={() => undefined}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
      />,
    )

    await user.click(screen.getByText('Appearance'))
    const choices = screen.getByRole('radiogroup', { name: 'Minute format' })
    expect(choices.querySelectorAll('input[type="radio"]')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: '12 minutes shown as 12′' })).toHaveProperty('checked', true)

    await user.click(screen.getByRole('radio', { name: '12 minutes shown as 12 min' }))
    expect(onMinuteFormatChange).toHaveBeenCalledWith('min')
  })
})

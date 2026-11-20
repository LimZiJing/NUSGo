// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PushNotificationService } from '../../domain/push/push-notifications'
import { SettingsContent } from './settings-content'
import type { SettingsSectionId } from './settings-section'

afterEach(cleanup)

const pushNotifications: PushNotificationService = {
  getEnvironment: () => ({ availability: 'unsupported', permission: 'denied' }),
  readPreference: () => null,
  enable: async () => ({ preference: null, permission: 'denied' }),
  disable: async () => null,
  readReminder: () => null,
  enableReminder: async () => ({ preference: null, permission: 'denied' }),
  disableReminder: async () => null,
}

type SettingsContentBaseProps = Omit<ComponentProps<typeof SettingsContent>, 'activeSection' | 'onActiveSectionChange'>

function SettingsHarness(props: Partial<SettingsContentBaseProps>) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(null)

  return (
    <>
      {activeSection !== null && (
        <button type="button" onClick={() => setActiveSection(null)}>Back to Settings</button>
      )}
      <SettingsContent
        communityWaypointDownloadUrl="/data/community-waypoints.geojson"
        themePreference="system"
        onThemePreferenceChange={() => undefined}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
        favoriteStops={[]}
        onMoveFavorite={() => undefined}
        onRemoveFavorite={() => undefined}
        onClearFavorites={() => undefined}
        transitMetadata={null}
        buildingSource={null}
        dataVersion={'a'.repeat(40)}
        pushNotifications={pushNotifications}
        {...props}
        activeSection={activeSection}
        onActiveSectionChange={setActiveSection}
      />
    </>
  )
}

describe('Settings navigation', () => {
  it('shows a searchable category list before opening section content', async () => {
    const user = userEvent.setup()
    render(<SettingsHarness />)

    expect(screen.getByRole('list', { name: 'Settings categories' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Appearance' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()

    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'community waypoint')
    expect(screen.getByRole('listbox', { name: 'Settings section results' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Waypoints/ })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Waypoints' })).toBeNull()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByRole('region', { name: 'Waypoints' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download approved community waypoints' }).getAttribute('href'))
      .toBe('/data/community-waypoints.geojson')
    expect(screen.queryByRole('list', { name: 'Settings categories' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(screen.getByRole('list', { name: 'Settings categories' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'About' }))
    expect(screen.getByRole('region', { name: 'About' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send feedback' })).toBeTruthy()
  })

  it('opens the notifications section from the category list and from search', async () => {
    const user = userEvent.setup()
    render(<SettingsHarness />)

    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    await user.type(screen.getByRole('combobox', { name: 'Search settings' }), 'push alerts')
    expect(screen.getByRole('option', { name: /Notifications/ })).toBeTruthy()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy()
  })

  it('clears a search query with Escape before leaving the category list', async () => {
    const user = userEvent.setup()
    render(<SettingsHarness />)

    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'waypoint')
    await user.keyboard('{Escape}')

    expect(search).toHaveProperty('value', '')
    expect(screen.queryByRole('listbox', { name: 'Settings section results' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeTruthy()
  })

  it('clears a search query with Escape when the clear button has focus', async () => {
    const user = userEvent.setup()
    render(<SettingsHarness />)

    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'waypoint')
    const clearButton = screen.getByRole('button', { name: 'Clear Search settings' })
    await user.tab()
    expect(document.activeElement).toBe(clearButton)

    await user.keyboard('{Escape}')

    expect(search).toHaveProperty('value', '')
    expect(screen.queryByRole('listbox', { name: 'Settings section results' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeTruthy()
  })
})

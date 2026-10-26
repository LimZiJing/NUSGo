// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FavouritesSection } from './favourites-section'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Favourites settings', () => {
  it('shows inline row controls in edit mode and confirms clearing all', async () => {
    const user = userEvent.setup()
    const onMoveFavorite = vi.fn()
    const onRemoveFavorite = vi.fn()
    const onClearFavorites = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    const { container } = render(
      <FavouritesSection
        stops={[
          { id: 'COM3', name: 'COM3 (Opp COM2)' },
          { id: 'COM2', name: 'COM2 (Opp COM3)' },
        ]}
        onMoveFavorite={onMoveFavorite}
        onRemoveFavorite={onRemoveFavorite}
        onClearFavorites={onClearFavorites}
      />,
    )

    expect(screen.getByRole('list', { name: 'Favourite bus stops' }).className).toContain('settings-favourite-list')
    expect(screen.getByText('COM3 (Opp COM2)')).toBeTruthy()
    expect(screen.getByText('COM2 (Opp COM3)')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Favourite stops 2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Manage in Stops' })).toBeNull()
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(container.querySelector('.saved-list-row')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Edit list' }))
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Move COM3 (Opp COM2) up' }).hasAttribute('disabled'))
      .toBe(true)
    await user.click(screen.getByRole('button', { name: 'Move COM2 (Opp COM3) up' }))
    expect(onMoveFavorite).toHaveBeenCalledWith('COM2', 'COM3')

    await user.click(screen.getByRole('button', { name: 'Remove COM3 (Opp COM2) from favourites' }))
    expect(onRemoveFavorite).toHaveBeenCalledWith('COM3')

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(confirm).toHaveBeenCalledWith('Clear all favourite bus stops?')
    expect(onClearFavorites).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearFavorites).toHaveBeenCalledOnce()
  })

  it('explains how to add favourites when the list is empty', () => {
    render(
      <FavouritesSection
        stops={[]}
        onMoveFavorite={vi.fn()}
        onRemoveFavorite={vi.fn()}
        onClearFavorites={vi.fn()}
      />,
    )

    expect(screen.getByText('Star a stop in Stops to add it to your favourites.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Manage in Stops' })).toBeNull()
  })
})

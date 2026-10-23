// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FavouritesSection } from './favourites-section'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Favourites settings', () => {
  it('removes a stop by its canonical name', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <FavouritesSection
        stops={[{ id: 'COM3', name: 'COM3 (Opp COM2)' }]}
        onRemove={onRemove}
        onClear={() => undefined}
      />,
    )

    await user.click(screen.getByText('Manage favourite stops'))
    await user.click(screen.getByRole('button', { name: 'Remove COM3 (Opp COM2) from favourites' }))
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('COM3')
  })

  it('confirms before clearing every saved stop', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(
      <FavouritesSection
        stops={[{ id: 'COM3', name: 'COM3' }]}
        onRemove={() => undefined}
        onClear={onClear}
      />,
    )

    await user.click(screen.getByText('Manage favourite stops'))
    await user.click(screen.getByRole('button', { name: 'Clear all favourites' }))
    expect(onClear).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear all favourites' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('shows the empty state after opening the saved stops row', async () => {
    const user = userEvent.setup()
    render(<FavouritesSection stops={[]} onRemove={() => undefined} onClear={() => undefined} />)

    expect(document.querySelector('.settings-disclosure[open]')).toBeNull()

    await user.click(screen.getByText('Manage favourite stops'))
    expect(screen.getByText('No favourite bus stops saved.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear all favourites' })).toBeNull()
  })
})

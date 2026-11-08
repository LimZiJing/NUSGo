// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MorePanelSurface, type MorePanelPage } from './more-panel-surface'

afterEach(cleanup)

describe('MorePanelSurface navigation', () => {
  it.each<MorePanelPage>(['menu', 'settings'])('uses the shared back button from %s', async (page) => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MorePanelSurface
        page={page}
        title={page === 'menu' ? 'More' : 'Settings'}
        statusMessage={null}
        statusRevision={0}
        initialFocusRef={createRef<HTMLButtonElement>()}
        onClose={onClose}
      >
        <p>Panel content</p>
      </MorePanelSurface>,
    )

    const backButton = screen.getByRole('button', { name: 'Back to previous view' })
    expect(backButton.classList.contains('icon-button')).toBe(true)
    expect(backButton.getAttribute('data-variant')).toBe('plain')
    expect(screen.queryByRole('button', { name: 'Close More' })).toBeNull()
    await user.click(backButton)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

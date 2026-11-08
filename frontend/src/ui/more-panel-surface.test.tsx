// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MorePanelSurface, type MorePanelPage } from './more-panel-surface'

afterEach(cleanup)

function renderSurface(statusMessage: string | null, statusRevision = 0) {
  const initialFocusRef = createRef<HTMLButtonElement>()
  return render(
    <MorePanelSurface
      page="waypoints"
      title="My waypoints"
      statusMessage={statusMessage}
      statusRevision={statusRevision}
      initialFocusRef={initialFocusRef}
      onClose={() => undefined}
    >
      <p>Panel content</p>
    </MorePanelSurface>,
  )
}

describe('MorePanelSurface', () => {
  it.each([null, ''])('keeps the polite status region mounted with empty message %s', (message) => {
    renderSurface(message)

    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('data-empty')).toBe('true')
    expect(status.textContent).toBe('')
  })

  it('inserts a message into the already-mounted region', () => {
    const { rerender } = renderSurface(null)
    const initialStatus = screen.getByRole('status')

    const initialFocusRef = createRef<HTMLButtonElement>()
    rerender(
      <MorePanelSurface
        page="waypoints"
        title="My waypoints"
        statusMessage="Place removed."
        statusRevision={1}
        initialFocusRef={initialFocusRef}
        onClose={() => undefined}
      >
        <p>Panel content</p>
      </MorePanelSurface>,
    )

    const status = screen.getByRole('status')
    expect(status).toBe(initialStatus)
    expect(status.getAttribute('data-empty')).toBe('false')
    expect(status.textContent).toBe('Place removed.')
  })

  it('remounts an identical message text node when its revision changes', () => {
    const { rerender } = renderSurface('Place removed.', 1)
    const firstText = screen.getByText('Place removed.')

    const initialFocusRef = createRef<HTMLButtonElement>()
    rerender(
      <MorePanelSurface
        page="waypoints"
        title="My waypoints"
        statusMessage="Place removed."
        statusRevision={2}
        initialFocusRef={initialFocusRef}
        onClose={() => undefined}
      >
        <p>Panel content</p>
      </MorePanelSurface>,
    )

    expect(screen.getByRole('status').textContent).toBe('Place removed.')
    expect(screen.getByText('Place removed.')).not.toBe(firstText)
  })
})

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

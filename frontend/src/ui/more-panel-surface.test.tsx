// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MorePanelSurface } from './more-panel-surface'

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
  it('keeps the polite status region mounted while it has no message', () => {
    renderSurface(null)

    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('data-empty')).toBe('true')
    expect(status.textContent).toBe('')
  })

  it('announces a message when one is inserted into the already-mounted region', () => {
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

  it('re-announces an identical message by remounting its text node', () => {
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

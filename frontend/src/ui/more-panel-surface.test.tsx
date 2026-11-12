// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MorePanelSurface } from './more-panel-surface'

afterEach(cleanup)

it('keeps the announcement region mounted and changes its content node for repeated confirmations', () => {
  const props = { page: 'waypoints' as const, title: 'My waypoints', statusMessage: null as string | null, statusRevision: 0, initialFocusRef: null, onClose: () => undefined, children: null }
  const { rerender } = render(<MorePanelSurface {...props} />)
  const region = screen.getByRole('status')
  expect(region.textContent).toBe('')
  rerender(<MorePanelSurface {...props} statusMessage="Moved to Work." statusRevision={1} />)
  const first = region.firstElementChild
  rerender(<MorePanelSurface {...props} statusMessage="Moved to Work." statusRevision={2} />)
  expect(screen.getByRole('status')).toBe(region)
  expect(region.textContent).toBe('Moved to Work.')
  expect(region.firstElementChild).not.toBe(first)
})

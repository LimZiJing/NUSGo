// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { PersonalWaypointDetails } from './personal-waypoint-details'

const waypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  note: 'Near the garden',
  markerColor: 'blue',
  markerIcon: 'dot',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

afterEach(cleanup)

function renderDetails(overrides: {
  readonly canManage?: boolean
  readonly onDirections?: () => void
  readonly onEdit?: () => void
  readonly onDelete?: () => void
} = {}) {
  const onDirections = overrides.onDirections ?? vi.fn()
  const onEdit = overrides.onEdit ?? vi.fn()
  const onDelete = overrides.onDelete ?? vi.fn()
  render(<PersonalWaypointDetails
    waypoint={waypoint}
    canManage={overrides.canManage ?? true}
    onDirections={onDirections}
    onEdit={onEdit}
    onDelete={onDelete}
  />)
  return { onDirections, onEdit, onDelete }
}

describe('PersonalWaypointDetails', () => {
  it('shows the waypoint identity, note and a compact Location disclosure', () => {
    renderDetails()

    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(screen.getByText('Rest spot')).toBeTruthy()
    expect(screen.getByText('Near the garden')).toBeTruthy()

    const disclosure = document.querySelector('.personal-waypoint-details-location-disclosure')
    expect(disclosure).toBeInstanceOf(HTMLDetailsElement)
    expect(disclosure?.hasAttribute('open')).toBe(false)
    expect(disclosure?.querySelector('summary')?.textContent).toContain('Location')
    expect(screen.getByText('1.290000, 103.780000').className)
      .toContain('personal-waypoint-details-coordinate')
  })

  it('shows the saved marker colour and icon in its identity header', () => {
    const custom: PersonalWaypoint = { ...waypoint, markerColor: 'purple', markerIcon: 'food' }
    render(<PersonalWaypointDetails
      waypoint={custom}
      canManage
      onDirections={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
    />)

    const icon = document.querySelector('.personal-waypoint-details-identity-icon')
    expect(icon?.getAttribute('data-marker-color')).toBe('purple')
    expect(icon?.getAttribute('data-marker-icon')).toBe('food')
    // The same colour class the list row paints, not the generic accent.
    expect(icon?.className).toContain('personal-waypoint-pin-purple')
    // `food` is the coffee glyph, so a different saved icon must change the rendered svg.
    expect(icon?.querySelector('svg')).toBeTruthy()
  })

  it('offers Navigate first with a leading icon and keeps edit and delete in the overflow', async () => {
    const user = userEvent.setup()
    const { onDirections, onEdit, onDelete } = renderDetails()

    const navigate = screen.getByRole('button', { name: 'Navigate' })
    const overflow = screen.getByRole('button', { name: 'More waypoint actions' })
    expect(navigate.getAttribute('data-variant')).toBe('primary')
    // The icon sits before the label, matching the Stop details action hierarchy.
    expect(navigate.firstElementChild?.tagName.toLowerCase()).toBe('svg')
    expect(navigate.textContent).toBe('Navigate')
    expect(screen.getAllByRole('button')).toEqual([overflow, navigate])

    expect(overflow.getAttribute('aria-expanded')).toBe('false')
    expect(overflow.getAttribute('aria-controls')).toBe('personal-waypoint-details-actions-menu')
    expect(screen.queryByRole('group', { name: 'Waypoint actions' })).toBeNull()

    await user.click(navigate)
    expect(onDirections).toHaveBeenCalledOnce()

    await user.click(overflow)
    expect(overflow.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.personal-waypoint-details')?.getAttribute('data-menu-open'))
      .toBe('true')

    const menu = screen.getByRole('group', { name: 'Waypoint actions' })
    expect(menu.querySelector('[disabled]')).toBeNull()
    const edit = screen.getByRole('button', { name: 'Edit waypoint' })
    const remove = screen.getByRole('button', { name: 'Delete waypoint' })
    expect(remove.className).toContain('personal-waypoint-details-delete')
    expect(Array.from(menu.querySelectorAll('button'))).toEqual([edit, remove])

    await user.click(edit)
    expect(onEdit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group', { name: 'Waypoint actions' })).toBeNull()
    expect(document.activeElement).toBe(overflow)

    await user.click(overflow)
    await user.click(screen.getByRole('button', { name: 'Delete waypoint' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('closes the overflow with Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup()
    renderDetails()

    const overflow = screen.getByRole('button', { name: 'More waypoint actions' })
    await user.click(overflow)
    expect(screen.getByRole('group', { name: 'Waypoint actions' })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Waypoint actions' })).toBeNull()
    expect(overflow.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(overflow)
  })

  it('disables the overflow entries when saved data cannot be managed', async () => {
    const user = userEvent.setup()
    renderDetails({ canManage: false })

    await user.click(screen.getByRole('button', { name: 'More waypoint actions' }))

    expect(screen.getByRole('button', { name: 'Edit waypoint' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete waypoint' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent)
      .toContain('Editing and deleting are unavailable')
  })

  it('explains when the selected waypoint is no longer available', () => {
    render(<PersonalWaypointDetails
      waypoint={null}
      canManage={false}
      onDirections={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
    />)

    expect(screen.getByRole('status').textContent).toContain('no longer available')
  })
})

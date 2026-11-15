// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
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

const noop = () => undefined
const baseProps = {
  waypoint,
  canManage: true,
  categories: ['Rest spot', 'Study spot'],
  onDirections: noop,
  onEdit: noop,
  onDelete: noop,
  onMove: noop,
}

afterEach(cleanup)

describe('PersonalWaypointDetails', () => {
  it('shows Navigate as the only filled action, with Move beside it', async () => {
    const user = userEvent.setup()
    const onDirections = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onDirections={onDirections} />)

    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(screen.getByText('Rest spot')).toBeTruthy()
    expect(screen.getByText('Near the garden')).toBeTruthy()
    expect(screen.getByText('1.290000, 103.780000').className)
      .toContain('personal-waypoint-details-coordinate')

    // Move is visible next to Navigate rather than hidden behind the overflow menu.
    const navigate = screen.getByRole('button', { name: 'Navigate' })
    expect(navigate.getAttribute('data-variant')).toBe('primary')
    const move = screen.getByRole('button', { name: 'Move to category' })
    expect(move.getAttribute('data-variant')).toBe('secondary')
    // Exactly one filled action.
    expect([...document.querySelectorAll<HTMLElement>('.button[data-variant="primary"]')]).toHaveLength(1)

    await user.click(navigate)
    expect(onDirections).toHaveBeenCalledOnce()
  })

  it('keeps the waypoint edit and delete commands in the one overflow menu', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onEdit={onEdit} onDelete={onDelete} />)

    // A details screen is allowed exactly one overflow menu trigger.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
    const menu = screen.getByRole('group', { name: 'Waypoint actions' })
    expect(within(menu).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['Edit waypoint', 'Delete waypoint'])

    await user.click(within(menu).getByRole('button', { name: 'Edit waypoint' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
    const reopened = screen.getByRole('group', { name: 'Waypoint actions' })
    await user.click(within(reopened).getByRole('button', { name: 'Delete waypoint' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('moves the place to an existing category chosen from the picker', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onMove={onMove} />)

    // The picker is not open until asked for; details stays a summary by default.
    expect(screen.queryByRole('combobox', { name: 'Move to' })).toBeNull()

    const move = screen.getByRole('button', { name: 'Move to category' })
    await user.click(move)
    expect(move.getAttribute('aria-expanded')).toBe('true')

    await user.click(screen.getByRole('combobox', { name: 'Move to' }))
    // The place's own category is not offered: moving there would do nothing.
    expect(screen.queryByRole('option', { name: 'Rest spot' })).toBeNull()
    await user.click(await screen.findByRole('option', { name: 'Study spot' }))
    expect(onMove).toHaveBeenCalledWith('Study spot')
  })

  it('offers a Create result for a category that does not exist yet', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onMove={onMove} />)

    await user.click(screen.getByRole('button', { name: 'Move to category' }))
    await user.type(screen.getByRole('combobox', { name: 'Move to' }), 'Work')
    await user.click(await screen.findByRole('button', { name: 'Create “Work”' }))
    expect(onMove).toHaveBeenCalledWith('Work')
  })

  it('works from the keyboard alone', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onMove={onMove} />)

    // Document order is the single overflow trigger, Navigate, then Move.
    await user.tab()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move to category' }))

    await user.keyboard('{Enter}')
    // Opening the picker puts Cancel next in order, then the picker's own field.
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel moving this waypoint' }))
    await user.tab()
    const field = screen.getByRole('combobox', { name: 'Move to' })
    expect(document.activeElement).toBe(field)

    await user.keyboard('Study')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onMove).toHaveBeenCalledWith('Study spot')
  })

  it('closes the move picker without moving anything', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<PersonalWaypointDetails {...baseProps} onMove={onMove} />)

    await user.click(screen.getByRole('button', { name: 'Move to category' }))
    await user.click(screen.getByRole('button', { name: 'Cancel moving this waypoint' }))
    expect(screen.queryByRole('combobox', { name: 'Move to' })).toBeNull()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does not offer Move while saved data needs recovery', () => {
    render(<PersonalWaypointDetails {...baseProps} canManage={false} />)

    expect(screen.getByRole('button', { name: 'Move to category' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toContain('unavailable until saved data is recovered')
  })

  it('explains when the selected waypoint is no longer available', () => {
    render(<PersonalWaypointDetails {...baseProps} waypoint={null} canManage={false} />)

    expect(screen.getByRole('status').textContent).toContain('no longer available')
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { PersonalWaypointPlacement } from './personal-waypoint-placement'

afterEach(cleanup)

const coordinate: WaypointCoordinate = { longitude: 103.7844, latitude: 1.2933 }

function renderPlacement(overrides: Partial<Parameters<typeof PersonalWaypointPlacement>[0]> = {}) {
  const props = {
    coordinate,
    onApplyCoordinate: vi.fn(),
    onContinue: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  const view = render(<PersonalWaypointPlacement {...props} />)
  return { props, ...view }
}

describe('PersonalWaypointPlacement', () => {
  it('shows only one extra control, Edit, until coordinate entry is opened', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    expect(screen.getByRole('heading', { name: 'Adjust waypoint location' })).toBeTruthy()
    expect(screen.getByText('1.293300° N · 103.784400° E')).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Edit', 'Use map centre', 'Cancel', 'Done adjusting location',
    ])
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))
    expect(props.onContinue).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledOnce()
  })

  it('applies a pasted coordinate on Enter and returns focus to Edit', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox', { name: 'Selected location' })
    expect(document.activeElement).toBe(input)
    expect((input as HTMLInputElement).value).toBe('1.293300, 103.784400')

    await user.clear(input)
    await user.click(input)
    await user.paste('1.2966, 103.7764')
    await user.keyboard('{Enter}')

    expect(props.onApplyCoordinate).toHaveBeenCalledWith({ latitude: 1.2966, longitude: 103.7764 })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit coordinates' }))
  })

  it('shows the parser message for invalid input and keeps the previous coordinate', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox', { name: 'Selected location' })
    await user.clear(input)
    await user.type(input, '103.7764, 1.2966{Enter}')

    expect(screen.getByRole('alert').textContent).toContain('Latitude must be between')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(props.onApplyCoordinate).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBe(input)

    await user.type(input, 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('cancels with Escape without applying or leaking the key', async () => {
    const user = userEvent.setup()
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    await user.type(screen.getByRole('textbox'), '{Escape}')
    window.removeEventListener('keydown', onWindowKeyDown)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('1.293300° N · 103.784400° E')).toBeTruthy()
    expect(props.onApplyCoordinate).not.toHaveBeenCalled()
    expect(onWindowKeyDown).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit coordinates' }))
  })

  it('closes entry from the Close button', async () => {
    const user = userEvent.setup()
    renderPlacement()
    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    await user.click(screen.getByRole('button', { name: 'Close coordinate entry' }))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('applies a valid typed value when Done is pressed with an edit open', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '1.30 103.78')
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))

    expect(props.onApplyCoordinate).toHaveBeenCalledWith({ latitude: 1.3, longitude: 103.78 })
    expect(props.onContinue).toHaveBeenCalledOnce()
  })

  it('stays on the screen with the error when Done is pressed with an invalid edit', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'nonsense')
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(props.onApplyCoordinate).not.toHaveBeenCalled()
    expect(props.onContinue).not.toHaveBeenCalled()
  })

  it('continues without applying when Done is pressed with an untouched edit', async () => {
    const user = userEvent.setup()
    const { props } = renderPlacement()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))

    expect(props.onApplyCoordinate).not.toHaveBeenCalled()
    expect(props.onContinue).toHaveBeenCalledOnce()
  })

  it('follows the pin while the edit is untouched', async () => {
    const user = userEvent.setup()
    const { rerender, props } = renderPlacement()
    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))

    rerender(<PersonalWaypointPlacement {...props} coordinate={{ latitude: 1.31, longitude: 103.79 }} />)

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1.310000, 103.790000')
  })

  it('warns, without blocking, about a point outside Singapore and clears it when the pin moves', async () => {
    const user = userEvent.setup()
    const { rerender, props } = renderPlacement()
    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '51.5072, -0.1276{Enter}')

    expect(props.onApplyCoordinate).toHaveBeenCalledWith({ latitude: 51.5072, longitude: -0.1276 })
    rerender(<PersonalWaypointPlacement {...props} coordinate={{ latitude: 51.5072, longitude: -0.1276 }} />)
    expect(screen.getByRole('status').textContent).toContain('outside Singapore')

    rerender(<PersonalWaypointPlacement {...props} coordinate={coordinate} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

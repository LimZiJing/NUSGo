// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppearanceSection } from './appearance-section'

describe('Appearance settings', () => {
  it('offers System, Light, and Dark choices and reports a selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AppearanceSection preference="system" onChange={onChange} />)

    expect((screen.getByRole('radio', { name: 'System' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('dark')
  })
})

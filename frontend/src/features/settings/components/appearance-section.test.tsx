// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceSection } from './appearance-section'

afterEach(cleanup)

describe('Appearance settings', () => {
  it('keeps System, Light, and Dark in the segmented control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AppearanceSection
        preference="system"
        onChange={onChange}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
      />,
    )

    expect((screen.getByRole('radio', { name: 'System' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Other themes Choose/ })).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('shows the selected palette in a dropdown and exposes choices in a listbox', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(
      <AppearanceSection
        preference="matcha"
        onChange={onChange}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
      />,
    )

    const heading = screen.getByText('Other themes', { selector: '.settings-choice-heading' })
    const trigger = screen.getByRole('button', { name: /Other themes Matcha/ })
    expect(heading).toBeTruthy()
    expect(trigger.getAttribute('data-size')).toBe('lg')
    expect(trigger.querySelector('[data-theme-choice="matcha"]')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(container.querySelector('.settings-theme-disclosure')).toBeNull()

    await user.click(trigger)
    const choices = screen.getByRole('listbox', { name: 'Other themes' })
    expect(choices.querySelectorAll('[role="option"]')).toHaveLength(4)
    expect(screen.getByRole('option', { name: 'Matcha' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Matcha' }).querySelector('.select-option-check')).toBeTruthy()

    await user.click(screen.getByRole('option', { name: 'NUS' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('nus')
  })

  it('selects Rainroom from the theme dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AppearanceSection
        preference="system"
        onChange={onChange}
        minuteFormat="prime"
        onMinuteFormatChange={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Other themes Choose/ }))
    await user.click(screen.getByRole('option', { name: 'Rainroom' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('rainroom')
  })
})

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

    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('shows the selected palette and exposes choices in an expandable radio group', async () => {
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

    const summary = screen.getByText('Other themes')
    const disclosure = summary.closest('details')
    expect(disclosure?.open).toBe(false)
    expect(screen.getByText('Matcha', { selector: '.settings-theme-selected' })).toBeTruthy()
    expect(container.querySelector('.settings-theme-selected [data-theme-choice="matcha"]')).toBeTruthy()

    await user.click(summary)
    expect(disclosure?.open).toBe(true)
    const choices = screen.getByRole('radiogroup', { name: 'Other themes' })
    expect(choices.querySelectorAll('input[type="radio"]')).toHaveLength(3)
    expect((screen.getByRole('radio', { name: 'Matcha' }) as HTMLInputElement).checked).toBe(true)
    expect(container.querySelectorAll('.settings-theme-check')).toHaveLength(1)

    await user.click(screen.getByRole('radio', { name: 'NUS' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('nus')
  })
})

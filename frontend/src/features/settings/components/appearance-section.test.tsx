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

  it('shows other palettes in a dropdown and reports their selection', async () => {
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

    const summary = screen.getByText('Other themes')
    const disclosure = summary.closest('details')
    expect(disclosure?.open).toBe(false)

    await user.click(summary)
    expect(disclosure?.open).toBe(true)
    expect(screen.getByRole('radio', { name: 'NUS' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Matcha' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Sakura' })).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Matcha' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('matcha')
  })
})

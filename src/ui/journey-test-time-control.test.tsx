// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JourneyTestTimeControl } from './journey-test-time-control'

describe('JourneyTestTimeControl', () => {
  it('applies valid Singapore time, rejects invalid input, and resets to live mode', () => {
    const onApply = vi.fn()
    const onReset = vi.fn()
    const { rerender } = render(<JourneyTestTimeControl simulatedAtMs={null} onApply={onApply} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test time' }))
    const input = screen.getByLabelText('Singapore date and time (SGT)')
    fireEvent.change(input, { target: { value: '2026-09-23T12:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(Date.parse('2026-09-23T04:30:00Z'))

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert').textContent).toContain('valid Singapore date')
    expect(onApply).toHaveBeenCalledTimes(1)

    rerender(<JourneyTestTimeControl simulatedAtMs={Date.parse('2026-09-23T04:30:00Z')} onApply={onApply} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to live' }))
    expect(onReset).toHaveBeenCalledOnce()
  })
})

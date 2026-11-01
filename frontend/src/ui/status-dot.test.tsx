// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusDot } from './status-dot'

afterEach(cleanup)

describe('StatusDot', () => {
  it('is a labelled image that does not rely on colour alone', () => {
    render(<StatusDot label="Live times" tone="success" />)

    const dot = screen.getByRole('img', { name: 'Live times' })
    expect(dot.getAttribute('data-tone')).toBe('success')
    expect(dot.getAttribute('data-pulse')).toBeNull()
  })

  it('defaults to muted and pulses only when asked', () => {
    render(<StatusDot label="Refreshing" pulse className="layout-hook" />)

    const dot = screen.getByRole('img', { name: 'Refreshing' })
    expect(dot.getAttribute('data-tone')).toBe('muted')
    expect(dot.getAttribute('data-pulse')).toBe('true')
    expect(dot.classList.contains('layout-hook')).toBe(true)
  })
})

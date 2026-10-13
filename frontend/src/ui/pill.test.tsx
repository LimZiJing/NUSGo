// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InfoPill } from './info-pill'
import { Pill } from './pill'

afterEach(cleanup)

describe('Pill', () => {
  it('is a non-interactive label', () => {
    render(<Pill label="Live" />)

    const pill = screen.getByText('Live')
    expect(pill.tagName).toBe('SPAN')
    expect(screen.queryByRole('button')).toBeNull()
    expect(pill.getAttribute('data-tone')).toBe('neutral')
  })

  it('supports a success tone and a leading dot', () => {
    render(<Pill label="Live" tone="success" leadingDot />)

    const pill = screen.getByText('Live')
    expect(pill.getAttribute('data-tone')).toBe('success')
    expect(pill.getAttribute('data-leading-dot')).toBe('true')
  })

  it('lets className add layout classes only', () => {
    render(<Pill label="Live" className="layout-hook" />)

    expect(screen.getByText('Live').className).toBe('pill layout-hook')
  })
})

describe('InfoPill', () => {
  it('keeps its API on top of Pill', () => {
    render(<InfoPill text="Live" colorScheme="success" leadingDot className="stop-badge" />)

    const pill = screen.getByText('Live')
    expect(pill.className).toBe('pill info-pill stop-badge')
    expect(pill.getAttribute('data-tone')).toBe('success')
    expect(pill.getAttribute('data-leading-dot')).toBe('true')
  })
})

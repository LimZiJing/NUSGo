// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FitRoutesControl } from './fit-routes-control'

describe('FitRoutesControl', () => {
  it('exposes an accessible action and invokes the fit callback', () => {
    const onFit = vi.fn()
    render(<FitRoutesControl onFit={onFit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fit routes' }))

    expect(onFit).toHaveBeenCalledOnce()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './select'

afterEach(cleanup)

const options = [
  { value: '', label: 'All buildings' },
  { value: 'a', label: 'Block A' },
  { value: 'b', label: 'Block B' },
]

function renderSelect(value = '', onChange = vi.fn()) {
  render(<Select label="Building" value={value} options={options} onChange={onChange} />)
  return { onChange, trigger: screen.getByRole('button') }
}

describe('Select', () => {
  it('renders the label and the selected option text', () => {
    const { trigger } = renderSelect('a')

    expect(screen.getByText('Building').tagName).toBe('LABEL')
    expect(trigger.textContent).toBe('Block A')
    expect(trigger.getAttribute('title')).toBe('Block A')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('hides the label visually but keeps it as the accessible name', () => {
    render(<Select label="Building" value="" options={options} onChange={vi.fn()} hideLabel />)

    expect(screen.getByText('Building').className).toContain('visually-hidden')
    expect(screen.getByRole('button', { name: /Building/ })).toBeTruthy()
  })

  it('opens and lists all options', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)

    const items = screen.getAllByRole('option')
    expect(items.map((item) => item.textContent)).toEqual(['All buildings', 'Block A', 'Block B'])
  })

  it('selecting an option calls onChange and closes the list', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect()

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Block B' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not call onChange when the chosen option is already selected', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect('a')

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Block A' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Escape closes the list and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ArrowDown on the trigger opens, then ArrowDown and Enter select the next option', async () => {
    const user = userEvent.setup()
    const { onChange, trigger } = renderSelect()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('exposes aria-expanded, aria-haspopup, and aria-selected', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect('a')

    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('option', { name: 'Block A' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Block B' }).getAttribute('aria-selected')).toBe('false')
  })
})

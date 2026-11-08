// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './select'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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
    expect(screen.getByRole('button', { name: 'Building Block A' })).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('hides the label visually but keeps it as the accessible name', () => {
    render(<Select label="Building" value="" options={options} onChange={vi.fn()} hideLabel />)

    expect(screen.getByText('Building').className).toContain('visually-hidden')
    expect(screen.getByRole('button', { name: /Building/ })).toBeTruthy()
  })

  it('shows a placeholder when no option is selected and supports a large trigger', () => {
    render(
      <Select
        label="Theme"
        value="unselected"
        placeholder="Choose"
        size="lg"
        options={options}
        onChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /Theme Choose/ })
    expect(trigger.getAttribute('data-size')).toBe('lg')
    expect(trigger.getAttribute('data-placeholder')).toBe('true')
    expect(trigger.textContent).toBe('Choose')
  })

  it('shows decorative leading content in the trigger and list options', async () => {
    const user = userEvent.setup()
    const optionsWithLeading = [
      { value: 'a', label: 'Block A', leading: <span data-testid="leading-mark" /> },
    ]
    render(<Select label="Building" value="a" options={optionsWithLeading} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /Building Block A/ })
    expect(trigger.querySelector('.select-trigger-leading [data-testid="leading-mark"]')).toBeTruthy()

    await user.click(trigger)
    const option = screen.getByRole('option', { name: 'Block A' })
    expect(option.querySelector('.select-option-leading [data-testid="leading-mark"]')).toBeTruthy()
    expect(option.firstElementChild?.classList.contains('select-option-check')).toBe(true)
  })

  it('can place the selected check after an option label', async () => {
    const user = userEvent.setup()
    render(
      <Select
        label="Theme"
        value="a"
        options={options}
        onChange={vi.fn()}
        checkPosition="end"
      />,
    )

    await user.click(screen.getByRole('button'))
    const option = screen.getByRole('option', { name: 'Block A' })
    expect(option.lastElementChild?.classList.contains('select-option-check')).toBe(true)
  })

  it('opens and lists all options', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)

    const items = screen.getAllByRole('option')
    expect(items.map((item) => item.textContent)).toEqual(['All buildings', 'Block A', 'Block B'])
  })

  it('keeps the option list wide enough to read labels when the trigger is narrow', async () => {
    const user = userEvent.setup()
    const rect = {
      x: 100,
      y: 50,
      top: 50,
      right: 200,
      bottom: 80,
      left: 100,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    } as DOMRect
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    const { trigger } = renderSelect()

    await user.click(trigger)

    expect(screen.getByRole('listbox').getAttribute('style')).toContain('width: 160px')
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

  it('keeps the selected option distinct as the active option moves', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect('a')

    await user.click(trigger)
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('option', { name: 'Block A' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Block A' }).getAttribute('data-active')).toBeNull()
    expect(screen.getByRole('option', { name: 'Block B' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('option', { name: 'Block B' }).getAttribute('data-active')).toBe('true')
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

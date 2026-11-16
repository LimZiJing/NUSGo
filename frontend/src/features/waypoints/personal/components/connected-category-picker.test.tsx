// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedCategoryPicker } from './connected-category-picker'

function StatefulPicker({ onSelect }: { readonly onSelect?: (category: string) => void }) {
  const [value, setValue] = useState('Commute')
  return <ConnectedCategoryPicker
    label="Category"
    value={value}
    options={['Commute', 'Work', 'Study place']}
    onSelect={(category) => {
      setValue(category)
      onSelect?.(category)
    }}
  />
}

afterEach(cleanup)

describe('ConnectedCategoryPicker', () => {
  it('shows the current category when closed and empties the field when opened', async () => {
    const user = userEvent.setup()
    render(<StatefulPicker />)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    expect(field.value).toBe('Commute')
    // The current value is never repeated as separate text beneath the field.
    expect(document.querySelector('.connected-category-picker-current')).toBeNull()

    await user.click(field)
    expect(field.value).toBe('')
    expect(field.placeholder).toBe('Search or create a category')
  })

  it('claims Escape so dismissing the list does not also leave the form', async () => {
    const user = userEvent.setup()
    // Mirrors the app's capture-phase Escape listener, which closes the More panel unless the
    // popup declares ownership. Without `data-owns-escape` this test fails.
    const formEscape = vi.fn()
    render(<div onKeyDownCapture={(event) => {
      if (event.defaultPrevented) return
      if ((event.target as Element).closest('[data-owns-escape="true"]')) return
      if (event.key === 'Escape') formEscape()
    }}><StatefulPicker /></div>)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.click(field)
    expect(field.value).toBe('')

    await user.keyboard('{Escape}')

    expect(formEscape).not.toHaveBeenCalled()
    expect(field.value).toBe('Commute')
    expect(document.querySelector('.connected-category-picker-popup')).toBeNull()
  })

  it('stays closed when the person clicks outside it', async () => {
    const user = userEvent.setup()
    render(<div>
      <StatefulPicker />
      <label htmlFor="note">Note</label>
      <input id="note" />
      <button type="button" data-test="elsewhere">Elsewhere</button>
      <div data-test="surface">Panel background</div>
    </div>)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    const elsewhere = document.querySelector('[data-test="elsewhere"]') as HTMLButtonElement
    const surface = document.querySelector('[data-test="surface"]') as HTMLDivElement
    const isOpen = () => document.querySelector('.connected-category-picker-popup') !== null

    // A focusable target: focus genuinely leaves the field, as it does on a real outside tap.
    await user.click(field)
    expect(isOpen()).toBe(true)
    await user.click(elsewhere)
    expect(isOpen()).toBe(false)
    expect(field.value).toBe('Commute')

    // A non-focusable surface, which is most of the More panel.
    await user.click(field)
    expect(isOpen()).toBe(true)
    await user.click(surface)
    expect(isOpen()).toBe(false)
    expect(field.value).toBe('Commute')
  })

  it('stays closed when the person dismisses it by clicking its own label', async () => {
    const user = userEvent.setup()
    render(<StatefulPicker />)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    const isOpen = () => document.querySelector('.connected-category-picker-popup') !== null

    await user.click(field)
    expect(isOpen()).toBe(true)

    // The label sits outside the field's own box, so clicking it dismisses the list like any other
    // outside press. It is also bound to the field, so it forwards focus back into the input — and
    // opening on focus then reopened the list. That flip-flop is what this test pins down.
    await user.click(screen.getByText('Category'))
    expect(isOpen()).toBe(false)
    expect(field.value).toBe('Commute')
  })

  it('opens when the field is reached by keyboard', async () => {
    const user = userEvent.setup()
    render(<>
      <button type="button">Before</button>
      <StatefulPicker />
    </>)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    ;(screen.getByRole('button', { name: 'Before' }) as HTMLButtonElement).focus()
    await user.tab()

    // Focusing the field must still open the list: that is what empties the field for searching,
    // so typing into it never appends to the saved category.
    expect(document.activeElement).toBe(field)
    expect(document.querySelector('.connected-category-picker-popup')).not.toBeNull()
    expect(field.value).toBe('')
  })

  it('commits a chosen category and closes the list', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatefulPicker onSelect={onSelect} />)

    const field = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.click(field)
    await user.click(await screen.findByRole('option', { name: 'Work' }))

    expect(onSelect).toHaveBeenCalledWith('Work')
    expect(field.value).toBe('Work')
    expect(document.querySelector('.connected-category-picker-popup')).toBeNull()
  })
})

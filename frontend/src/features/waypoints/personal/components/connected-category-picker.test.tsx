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

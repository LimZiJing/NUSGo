// @vitest-environment jsdom

import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SavedListRow } from './saved-list-row'

describe('SavedListRow', () => {
  it('forwards a ref to the list item', () => {
    const rowRef = createRef<HTMLLIElement>()

    render(
      <ul>
        <SavedListRow
          leading={<span />}
          title="Quiet bench"
          rowRef={rowRef}
        />
      </ul>,
    )

    expect(rowRef.current).toBe(screen.getByRole('listitem'))
  })

  it('uses a shared Button for selectable row copy', () => {
    const onSelect = vi.fn()
    render(
      <ul>
        <SavedListRow
          leading={<span />}
          title="Quiet bench"
          subtitle="Rest areas"
          onSelect={onSelect}
        />
      </ul>,
    )

    const selectButton = screen.getByRole('button', { name: 'Quiet bench, Rest areas' })
    expect(selectButton.classList.contains('button')).toBe(true)
    fireEvent.click(selectButton)
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
